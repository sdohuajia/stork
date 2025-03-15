
import AmazonCognitoIdentity from 'amazon-cognito-identity-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { accounts } from "./accounts.js"
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从config.json加载配置
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');

    if (!fs.existsSync(configPath)) {
      log(`在 ${configPath} 未找到配置文件，使用默认配置`, '警告');
      // 创建默认配置文件
      const defaultConfig = {
        cognito: {
          region: 'ap-northeast-1',
          clientId: '5msns4n49hmg3dftp2tp1t2iuh',
          userPoolId: 'ap-northeast-1_M22I44OpC',
          },
        stork: {
          intervalSeconds: 30
        },
        threads: {
          maxWorkers: 1
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      return defaultConfig;
    }
    
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    log('成功从 config.json 加载配置\n');
    log('成功从 accounts.js 加载账户');
    return userConfig;
  } catch (error) {
    log(`加载配置错误: ${error.message}`, '错误');
    throw new Error('配置加载失败');
  }
}

const userConfig = loadConfig();
const config = {
  cognito: {
    region: userConfig.cognito?.region || 'ap-northeast-1',
    clientId: userConfig.cognito?.clientId || '5msns4n49hmg3dftp2tp1t2iuh',
    userPoolId: userConfig.cognito?.userPoolId || 'ap-northeast-1_M22I44OpC',
    username: userConfig.cognito?.username || '',
    password: userConfig.cognito?.password || ''
  },
  stork: {
    baseURL: 'https://app-api.jp.stork-oracle.network/v1',
    authURL: 'https://api.jp.stork-oracle.network/auth',
    tokenPath: path.join(__dirname, 'tokens.json'),
    intervalSeconds: userConfig.stork?.intervalSeconds || 10,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    origin: 'chrome-extension://knnliglhgkmlblppdejchidfihjnockl'
  },
  threads: {
    maxWorkers: userConfig.threads?.maxWorkers || 10,
    proxyFile: path.join(__dirname, 'proxies.txt')
  }
};

function validateConfig() {
  if (!accounts[0].username || !accounts[0].password) {
    log('错误: 必须在accounts.js中设置用户名和密码', '错误');
    console.log('\n请更新您的accounts.js文件：');
    console.log(JSON.stringify({
        username: "您的邮箱",
        password: "您的密码"
    }, null, 2));
    return false;
  }
  return true;
}

const poolData = { UserPoolId: config.cognito.userPoolId, ClientId: config.cognito.clientId };
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substr(0, 19);
}

function getFormattedDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function log(message, type = '信息') {
  console.log(`[${getFormattedDate()}] [${type}] ${message}`);
}

function loadProxies() {
  try {
    const rotate = arr => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
        return arr;
      };
    if (!fs.existsSync(config.threads.proxyFile)) {
      log(`在 ${config.threads.proxyFile} 未找到代理文件，创建空文件`, '警告');
      fs.writeFileSync(config.threads.proxyFile, '', 'utf8');
      return [];
    }
    const proxyData = fs.readFileSync(config.threads.proxyFile, 'utf8');
    const proxies = proxyData
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    const rotatedProxy = rotate(proxies);
    log(`从 ${config.threads.proxyFile} 加载了 ${proxies.length} 个代理`);
    log(`尝试使用代理 ${rotatedProxy[0]}`);
    return rotatedProxy;
  } catch (error) {
    log(`加载代理错误: ${error.message}`, '错误');
    return [];
  }
}

class CognitoAuth {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({ Username: username, Password: password });
    this.cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: username, Pool: userPool });
  }

  authenticate() {
    return new Promise((resolve, reject) => {
      this.cognitoUser.authenticateUser(this.authenticationDetails, {
        onSuccess: (result) => resolve({
          accessToken: result.getAccessToken().getJwtToken(),
          idToken: result.getIdToken().getJwtToken(),
          refreshToken: result.getRefreshToken().getToken(),
          expiresIn: result.getAccessToken().getExpiration() * 1000 - Date.now()
        }),
        onFailure: (err) => reject(err),
        newPasswordRequired: () => reject(new Error('需要新密码'))
      });
    });
  }

  refreshSession(refreshToken) {
    const refreshTokenObj = new AmazonCognitoIdentity.CognitoRefreshToken({ RefreshToken: refreshToken });
    return new Promise((resolve, reject) => {
      this.cognitoUser.refreshSession(refreshTokenObj, (err, result) => {
        if (err) reject(err);
        else resolve({
          accessToken: result.getAccessToken().getJwtToken(),
          idToken: result.getIdToken().getJwtToken(),
          refreshToken: refreshToken,
          expiresIn: result.getAccessToken().getExpiration() * 1000 - Date.now()
        });
      });
    });
  }
}

class TokenManager {
  constructor(i) {
    this.accessToken = null;
    this.refreshToken = null;
    this.idToken = null;
    this.expiresAt = null;
    this.auth = new CognitoAuth(accounts[i].username, accounts[i].password);
  }

  async getValidToken() {
    if (!this.accessToken || this.isTokenExpired()) await this.refreshOrAuthenticate();
    return this.accessToken;
  }

  isTokenExpired() {
    return Date.now() >= this.expiresAt;
  }

  async refreshOrAuthenticate() {
    try {
      let result = this.refreshToken ? await this.auth.refreshSession(this.refreshToken) : await this.auth.authenticate();
      await this.updateTokens(result);
    } catch (error) {
      log(`令牌刷新/认证错误: ${error.message}`, '错误');
      throw error;
    }
  }

  async updateTokens(result) {
    this.accessToken = result.accessToken;
    this.idToken = result.idToken;
    this.refreshToken = result.refreshToken;
    this.expiresAt = Date.now() + result.expiresIn;
    const tokens = { accessToken: this.accessToken, idToken: this.idToken, refreshToken: this.refreshToken, isAuthenticated: true, isVerifying: false };
    await saveTokens(tokens);
    log('令牌已更新并保存到 tokens.json');
  }
}

async function getTokens() {
  try {
    if (!fs.existsSync(config.stork.tokenPath)) throw new Error(`在 ${config.stork.tokenPath} 未找到令牌文件`);
    const tokensData = await fs.promises.readFile(config.stork.tokenPath, 'utf8');
    const tokens = JSON.parse(tokensData);
    if (!tokens.accessToken || tokens.accessToken.length < 20) throw new Error('无效的访问令牌');
    log(`成功读取访问令牌: ${tokens.accessToken.substring(0, 10)}...`);
    return tokens;
  } catch (error) {
    log(`读取令牌错误: ${error.message}`, '错误');
    throw error;
  }
}

async function saveTokens(tokens) {
  try {
    await fs.promises.writeFile(config.stork.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    log('令牌保存成功');
    return true;
  } catch (error) {
    log(`保存令牌错误: ${error.message}`, '错误');
    return false;
  }
}

function getProxyAgent(proxy) {
  if (!proxy) return null;
  if (proxy.startsWith('http')) return new HttpsProxyAgent(proxy);
  if (proxy.startsWith('socks4') || proxy.startsWith('socks5')) return new SocksProxyAgent(proxy);
  throw new Error(`不支持的代理协议: ${proxy}`);
}

async function refreshTokens(refreshToken) {
  try {
    log('正在通过Stork API刷新访问令牌...');
    const response = await axios({
      method: 'POST',
      url: `${config.stork.authURL}/refresh`,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': config.stork.userAgent,
        'Origin': config.stork.origin
      },
      data: { refresh_token: refreshToken }
    });
    const tokens = {
      accessToken: response.data.access_token,
      idToken: response.data.id_token || '',
      refreshToken: response.data.refresh_token || refreshToken,
      isAuthenticated: true,
      isVerifying: false
    };
    await saveTokens(tokens);
    log('通过Stork API成功刷新令牌');
    return tokens;
  } catch (error) {
    log(`令牌刷新失败: ${error.message}`, '错误');
    throw error;
  }
}

async function getSignedPrices(tokens) {
  try {
    log('获取签名价格数据...');
    const response = await axios({
      method: 'GET',
      url: `${config.stork.baseURL}/stork_signed_prices`,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
        'Origin': config.stork.origin,
        'User-Agent': config.stork.userAgent
      }
    });
    const dataObj = response.data.data;
    const result = Object.keys(dataObj).map(assetKey => {
      const assetData = dataObj[assetKey];
      return {
        asset: assetKey,
        msg_hash: assetData.timestamped_signature.msg_hash,
        price: assetData.price,
        timestamp: new Date(assetData.timestamped_signature.timestamp / 1000000).toISOString(),
        ...assetData
      };
    });
    log(`成功获取 ${result.length} 条签名价格`);
    return result;
  } catch (error) {
    log(`获取签名价格错误: ${error.message}`, '错误');
    throw error;
  }
}

async function sendValidation(tokens, msgHash, isValid, proxy) {
  try {
    const agent = getProxyAgent(proxy);
    const response = await axios({
      method: 'POST',
      url: `${config.stork.baseURL}/stork_signed_prices/validations`,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
        'Origin': config.stork.origin,
        'User-Agent': config.stork.userAgent
      },
      httpsAgent: agent,
      data: { msg_hash: msgHash, valid: isValid }
    });
    log(`✓ 验证成功 ${msgHash.substring(0, 10)}... 通过代理 ${proxy || '直连'}`);
    return response.data;
  } catch (error) {
    log(`✗ 验证失败 ${msgHash.substring(0, 10)}...: ${error.message}`, '错误');
    throw error;
  }
}

async function getUserStats(tokens) {
  try {
    log('获取用户统计...');
    const response = await axios({
      method: 'GET',
      url: `${config.stork.baseURL}/me`,
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
        'Origin': config.stork.origin,
        'User-Agent': config.stork.userAgent
      }
    });
    return response.data.data;
  } catch (error) {
    log(`获取用户统计错误: ${error.message}`, '错误');
    throw error;
  }
}

function validatePrice(priceData) {
  try {
    log(`正在验证资产 ${priceData.asset || '未知资产'}`);
    if (!priceData.msg_hash || !priceData.price || !priceData.timestamp) {
      log('数据不完整，视为无效', '警告');
      return false;
    }
    const currentTime = Date.now();
    const dataTime = new Date(priceData.timestamp).getTime();
    const timeDiffMinutes = (currentTime - dataTime) / (1000 * 60);
    if (timeDiffMinutes > 60) {
      log(`数据过时 (${Math.round(timeDiffMinutes)} 分钟前)`, '警告');
      return false;
    }
    return true;
  } catch (error) {
    log(`验证错误: ${error.message}`, '错误');
    return false;
  }
}

if (!isMainThread) {
  const { priceData, tokens, proxy } = workerData;

  async function validateAndSend() {
    try {
      const isValid = validatePrice(priceData);
      await sendValidation(tokens, priceData.msg_hash, isValid, proxy);
      parentPort.postMessage({ success: true, msgHash: priceData.msg_hash, isValid });
    } catch (error) {
      parentPort.postMessage({ success: false, error: error.message, msgHash: priceData.msg_hash });
    }
  }

  validateAndSend();
} else {
  let previousStats = { validCount: 0, invalidCount: 0 };

  async function runValidationProcess(tokenManager) {
    try {
      log('--------- 开始验证流程 ---------');
      const tokens = await getTokens();
      const initialUserData = await getUserStats(tokens);

      if (!initialUserData || !initialUserData.stats) {
        throw new Error('无法获取初始用户统计');
      }

      const initialValidCount = initialUserData.stats.stork_signed_prices_valid_count || 0;
      const initialInvalidCount = initialUserData.stats.stork_signed_prices_invalid_count || 0;

      if (previousStats.validCount === 0 && previousStats.invalidCount === 0) {
        previousStats.validCount = initialValidCount;
        previousStats.invalidCount = initialInvalidCount;
      }

      const signedPrices = await getSignedPrices(tokens);
      const proxies = await loadProxies();

      if (!signedPrices || signedPrices.length === 0) {
        log('没有需要验证的数据');
        const userData = await getUserStats(tokens);
        displayStats(userData);
        return;
      }

      log(`使用 ${config.threads.maxWorkers} 个工作线程处理 ${signedPrices.length} 个数据点...`);
      const workers = [];

      const chunkSize = Math.ceil(signedPrices.length / config.threads.maxWorkers);
      const batches = [];
      for (let i = 0; i < signedPrices.length; i += chunkSize) {
        batches.push(signedPrices.slice(i, i + chunkSize));
      }

      for (let i = 0; i < Math.min(batches.length, config.threads.maxWorkers); i++) {
        const batch = batches[i];
        const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;

        batch.forEach(priceData => {
          workers.push(new Promise((resolve) => {
            const worker = new Worker(__filename, {
              workerData: { priceData, tokens, proxy }
            });
            worker.on('message', resolve);
            worker.on('error', (error) => resolve({ success: false, error: error.message }));
            worker.on('exit', () => resolve({ success: false, error: '工作线程退出' }));
          }));
        });
      }

      const results = await Promise.all(workers);
      const successCount = results.filter(r => r.success).length;
      log(`成功验证 ${successCount}/${results.length} 个数据`);

      const updatedUserData = await getUserStats(tokens);
      const newValidCount = updatedUserData.stats.stork_signed_prices_valid_count || 0;
      const newInvalidCount = updatedUserData.stats.stork_signed_prices_invalid_count || 0;

      const actualValidIncrease = newValidCount - previousStats.validCount;
      const actualInvalidIncrease = newInvalidCount - previousStats.invalidCount;

      previousStats.validCount = newValidCount;
      previousStats.invalidCount = newInvalidCount;

      displayStats(updatedUserData);
      log(`--------- 验证摘要 ---------`);
      log(`总处理数据: ${newValidCount}`);
      log(`成功: ${actualValidIncrease}`);
      log(`失败: ${actualInvalidIncrease}`);
      log('--------- 完成 ---------');
      
      if (jobs < accounts.length) {
        setTimeout(() => main(), config.stork.intervalSeconds * 1000);
      } else if (jobs == accounts.length - 1 || jobs === accounts.length) {
        jobs = 0;
        setTimeout(() => main(), config.stork.intervalSeconds * 1000);
      } 
    } catch (error) {
      log(`验证过程已停止: ${error.message}`, '错误');
    }
  }

  function displayStats(userData) {
    if (!userData || !userData.stats) {
      log('没有可用的有效统计数据', '警告');
      return;
    }

    console.clear();
    console.log('=============================================');
    console.log('   STORK ORACLE 自动机器人   ');
    console.log('=============================================');
    console.log(`时间: ${getTimestamp()}`);
    console.log('---------------------------------------------');
    console.log(`用户: ${userData.email || '无'}`);
    console.log(`ID: ${userData.id || '无'}`);
    console.log(`推荐码: ${userData.referral_code || '无'}`);
    console.log('---------------------------------------------');
    console.log('验证统计:');
    console.log(`✓ 有效验证: ${userData.stats.stork_signed_prices_valid_count || 0}`);
    console.log(`✗ 无效验证: ${userData.stats.stork_signed_prices_invalid_count || 0}`);
    console.log(`↻ 上次验证时间: ${userData.stats.stork_signed_prices_last_verified_at || '从未'}`);
    console.log(`👥 推荐使用次数: ${userData.stats.referral_usage_count || 0}`);
    console.log('---------------------------------------------');
    console.log(`下次验证将在 ${config.stork.intervalSeconds} 秒后进行...`);
    console.log('=============================================');
  }

  async function main() {
    if (!validateConfig()) {
      process.exit(1);
    }
    
    log(`正在处理 ${accounts[jobs].username}`);
    const tokenManager = new TokenManager(jobs);
    jobs++;

    try {
      await tokenManager.getValidToken();
      log('初始认证成功');

      runValidationProcess(tokenManager);
      
      // 防止垃圾邮件，通过禁用此间隔，因为上面的代码已经通过作业序列触发
//     setInterval(() => runValidationProcess(tokenManager), config.stork.intervalSeconds * 1000);

      setInterval(async () => {
        await tokenManager.getValidToken();
        log('通过 Cognito 刷新令牌');
      }, 50 * 60 * 1000);
    } catch (error) {
      log(`应用程序启动失败: ${error.message}`, '错误');
      process.exit(1);
    }
  }
  
  let jobs = 0;
  main();
}
