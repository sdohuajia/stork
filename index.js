const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpProxyAgent } = require('https-proxy-agent');
const moment = require('moment-timezone');
const chalk = require('chalk');
const fs = require('fs').promises;
const os = require('os');

const wib = 'Asia/Jakarta';

class Stork {
  constructor() {
    this.headers = {
      Accept: '*/*',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    };
    this.GOTRUE_API_URL = 'https://app-auth.jp.stork-oracle.network';
    this.STORK_API_URL = 'https://app-api.jp.stork-oracle.network';
    this.proxies = [];
    this.proxyIndex = 0;
    this.accountProxies = {};
    this.accessTokens = {};
    this.refreshTokens = {};
  }

  clearTerminal() {
    console.clear();
  }

  log(message) {
    console.log(
      `${chalk.cyanBright(`[ ${moment().tz(wib).format('MM/DD/YY HH:mm:ss z')} ]`)}${chalk.whiteBright(' | ')}${message}`
    );
  }

  welcome() {
    console.log(
      `${chalk.greenBright('自动Ping ')}${chalk.blueBright('Stork - 机器人')}\n` +
      `${chalk.greenBright('Rey? ')}${chalk.yellowBright('<这不是水印，这是神>')}`
    );
  }

  formatSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  async loadAccounts() {
    const filename = 'accounts.json';
    try {
      const data = await fs.readFile(filename, 'utf8');
      const accounts = JSON.parse(data);
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.log(`${chalk.redBright(`文件 ${filename} 未找到。`)}`);
      } else {
        this.log(`${chalk.redBright(`解析 ${filename} 出错：${error.message}`)}`);
      }
      return [];
    }
  }

  async loadProxies() {
    const filename = 'proxy.txt';
    try {
      const data = await fs.readFile(filename, 'utf8');
      this.proxies = data.split('\n').filter((line) => line.trim());
      if (!this.proxies.length) {
        this.log(`${chalk.redBright('未找到代理，将不使用代理运行。')}`);
        return false;
      }
      this.log(
        `${chalk.greenBright('代理总数：')}${chalk.whiteBright(this.proxies.length)}`
      );
      return true;
    } catch (error) {
      this.log(`${chalk.redBright(`加载代理失败，将不使用代理运行：${error.message}`)}`);
      this.proxies = [];
      return false;
    }
  }

  checkProxySchemes(proxy) {
    const schemes = ['http://', 'https://', 'socks4://', 'socks5://'];
    return schemes.some((scheme) => proxy.startsWith(scheme)) ? proxy : `http://${proxy}`;
  }

  getNextProxyForAccount(account) {
    if (!(account in this.accountProxies)) {
      if (!this.proxies.length) return null;
      const proxy = this.checkProxySchemes(this.proxies[this.proxyIndex]);
      this.accountProxies[account] = proxy;
      this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    }
    return this.accountProxies[account];
  }

  rotateProxyForAccount(account) {
    if (!this.proxies.length) return null;
    const proxy = this.checkProxySchemes(this.proxies[this.proxyIndex]);
    this.accountProxies[account] = proxy;
    this.proxyIndex = (this.proxyIndex + 1) % this.proxies.length;
    return proxy;
  }

  maskAccount(account) {
    if (account.includes('@')) {
      const [local, domain] = account.split('@');
      const maskedLocal = local.slice(0, 3) + '***' + local.slice(-3);
      return `${maskedLocal}@${domain}`;
    }
    return account.slice(0, 3) + '***' + account.slice(-3);
  }

  printMessage(account, proxy, color, message) {
    this.log(
      `${chalk.cyanBright('[ 账户：')}${chalk.whiteBright(` ${this.maskAccount(account)} `)}${chalk.magentaBright(
        '-'
      )}${chalk.cyanBright(' 代理：')}${chalk.whiteBright(proxy || '无')}${chalk.magentaBright(
        ' - '
      )}${chalk.cyanBright('状态：')}${color(message)}`
    );
  }

  async userLogin(email, password, proxy, retries = 5) {
    const url = `${this.GOTRUE_API_URL}/token?grant_type=password`;
    const data = { email, password };
    const headers = {
      ...this.headers,
      'Content-Type': 'application/json',
      Origin: 'https://app.stork.network',
      Referer: 'https://app.stork.network/',
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const agent = proxy
          ? proxy.startsWith('socks')
            ? new SocksProxyAgent(proxy)
            : new HttpProxyAgent(proxy)
          : null;
        const response = await axios.post(url, data, {
          headers,
          httpsAgent: agent,
          timeout: 60000,
        });
        return response.data;
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.printMessage(
          email,
          proxy,
          chalk.redBright,
          `登录失败：${chalk.yellowBright(error.message)}`
        );
        return null;
      }
    }
  }

  async refreshToken(email, password, useProxy, proxy, retries = 5) {
    const url = `${this.GOTRUE_API_URL}/token?grant_type=refresh_token`;
    const data = { refresh_token: this.refreshTokens[email] };
    const headers = {
      ...this.headers,
      'Content-Type': 'application/json',
      Origin: 'chrome-extension://knnliglhgkmlblppdejchidfihjnockl',
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const agent = proxy
          ? proxy.startsWith('socks')
            ? new SocksProxyAgent(proxy)
            : new HttpProxyAgent(proxy)
          : null;
        const response = await axios.post(url, data, {
          headers,
          httpsAgent: agent,
          timeout: 120000,
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 401) {
          await this.processUserLogin(email, password, useProxy);
          data.refresh_token = this.refreshTokens[email];
          continue;
        }
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.printMessage(
          email,
          proxy,
          chalk.redBright,
          `刷新令牌失败：${chalk.yellowBright(error.message)}`
        );
        return null;
      }
    }
  }

  async userInfo(email, proxy, retries = 5) {
    const url = `${this.STORK_API_URL}/v1/me`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.accessTokens[email]}`,
      Origin: 'chrome-extension://knnliglhgkmlblppdejchidfihjnockl',
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const agent = proxy
          ? proxy.startsWith('socks')
            ? new SocksProxyAgent(proxy)
            : new HttpProxyAgent(proxy)
          : null;
        const response = await axios.get(url, {
          headers,
          httpsAgent: agent,
          timeout: 120000,
        });
        return response.data.data;
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.printMessage(
          email,
          proxy,
          chalk.redBright,
          `获取用户数据失败：${chalk.yellowBright(error.message)}`
        );
        return null;
      }
    }
  }

  async turnOnVerification(email, proxy, retries = 5) {
    const url = `${this.STORK_API_URL}/v1/stork_signed_prices`;
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.accessTokens[email]}`,
      Origin: 'chrome-extension://knnliglhgkmlblppdejchidfihjnockl',
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const agent = proxy
          ? proxy.startsWith('socks')
            ? new SocksProxyAgent(proxy)
            : new HttpProxyAgent(proxy)
          : null;
        const response = await axios.get(url, {
          headers,
          httpsAgent: agent,
          timeout: 120000,
        });
        return response.data.data;
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.printMessage(
          email,
          proxy,
          chalk.redBright,
          `获取消息哈希失败：${chalk.yellowBright(error.message)}`
        );
        return null;
      }
    }
  }

  async validateVerification(email, msgHash, proxy, retries = 5) {
    const url = `${this.STORK_API_URL}/v1/stork_signed_prices/validations`;
    const data = { msg_hash: msgHash, valid: true };
    const headers = {
      ...this.headers,
      Authorization: `Bearer ${this.accessTokens[email]}`,
      'Content-Type': 'application/json',
      Origin: 'chrome-extension://knnliglhgkmlblppdejchidfihjnockl',
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const agent = proxy
          ? proxy.startsWith('socks')
            ? new SocksProxyAgent(proxy)
            : new HttpProxyAgent(proxy)
          : null;
        const response = await axios.post(url, data, {
          headers,
          httpsAgent: agent,
          timeout: 60000,
        });
        return response.data;
      } catch (error) {
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        this.printMessage(
          email,
          proxy,
          chalk.redBright,
          `Ping失败：${chalk.yellowBright(error.message)}`
        );
        return null;
      }
    }
  }

  async processUserLogin(email, password, useProxy) {
    let proxy = useProxy ? this.getNextProxyForAccount(email) : null;
    let token = null;
    while (!token) {
      token = await this.userLogin(email, password, proxy);
      if (!token) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        proxy = useProxy ? this.rotateProxyForAccount(email) : null;
        continue;
      }

      this.accessTokens[email] = token.access_token;
      this.refreshTokens[email] = token.refresh_token;

      this.printMessage(email, proxy, chalk.greenBright, '登录成功');
      return [this.accessTokens[email], this.refreshTokens[email]];
    }
  }

  async processRefreshingToken(email, password, useProxy) {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 55 * 60 * 1000));
      let proxy = useProxy ? this.getNextProxyForAccount(email) : null;
      let token = null;
      while (!token) {
        token = await this.refreshToken(email, password, useProxy, proxy);
        if (!token) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          proxy = useProxy ? this.rotateProxyForAccount(email) : null;
          continue;
        }

        this.accessTokens[email] = token.access_token;
        this.refreshTokens[email] = token.refresh_token;

        this.printMessage(email, proxy, chalk.greenBright, '刷新令牌成功');
      }
    }
  }

  async processUserEarning(email, useProxy) {
    while (true) {
      const proxy = useProxy ? this.getNextProxyForAccount(email) : null;
      const user = await this.userInfo(email, proxy);
      if (user) {
        const verifiedMsg = user.stats?.stork_signed_prices_valid_count || 0;
        const invalidMsg = user.stats?.stork_signed_prices_invalid_count || 0;

        this.printMessage(
          email,
          proxy,
          chalk.greenBright,
          `已验证消息：${chalk.whiteBright(` ${verifiedMsg} `)}${chalk.magentaBright(
            '-'
          )}${chalk.yellowBright(' 无效消息：')}${chalk.whiteBright(invalidMsg)}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
    }
  }

  async processSendPing(email, useProxy) {
    while (true) {
      const proxy = useProxy ? this.getNextProxyForAccount(email) : null;

      process.stdout.write(
        `${chalk.cyanBright(`[ ${moment().tz(wib).format('MM/DD/YY HH:mm:ss z')} ]`)}${chalk.whiteBright(
          ' | '
        )}${chalk.yellowBright('尝试获取哈希消息...')}\r`
      );

      const verify = await this.turnOnVerification(email, proxy);
      if (verify) {
        let msgHash;
        for (const key in verify) {
          if (key.includes('USD')) {
            msgHash = verify[key].timestamped_signature?.msg_hash;
            this.printMessage(
              email,
              proxy,
              chalk.greenBright,
              `消息哈希：${chalk.blueBright(this.maskAccount(msgHash))}`
            );
            break;
          }
        }

        process.stdout.write(
          `${chalk.cyanBright(`[ ${moment().tz(wib).format('MM/DD/YY HH:mm:ss z')} ]`)}${chalk.whiteBright(
            ' | '
          )}${chalk.yellowBright('尝试发送Ping...')}\r`
        );

        const ping = await this.validateVerification(email, msgHash, proxy);
        if (ping && ping.message === 'ok') {
          this.printMessage(email, proxy, chalk.greenBright, 'Ping成功');
        }
      }

      process.stdout.write(
        `${chalk.cyanBright(`[ ${moment().tz(wib).format('MM/DD/YY HH:mm:ss z')} ]`)}${chalk.whiteBright(
          ' | '
        )}${chalk.blueBright('等待5分钟进行下一次Ping...')}\r`
      );
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
    }
  }

  async processAccounts(email, password, useProxy) {
    const [accessToken, refreshToken] = await this.processUserLogin(email, password, useProxy);
    if (accessToken && refreshToken) {
      const tasks = [
        this.processRefreshingToken(email, password, useProxy),
        this.processUserEarning(email, useProxy),
        this.processSendPing(email, useProxy),
      ];
      await Promise.all(tasks);
    }
  }

  async main() {
    try {
      const accounts = await this.loadAccounts();
      if (!accounts.length) {
        this.log(`${chalk.redBright('未加载任何账户。')}`);
        return;
      }

      this.clearTerminal();
      this.welcome();
      this.log(
        `${chalk.greenBright('账户总数：')}${chalk.whiteBright(accounts.length)}`
      );

      const useProxy = await this.loadProxies();

      this.log(`${chalk.cyanBright('-').repeat(75)}`);

      while (true) {
        const tasks = accounts
          .filter((account) => account && account.Email && account.Password && account.Email.includes('@'))
          .map((account) =>
            this.processAccounts(account.Email, account.Password, useProxy)
          );
        await Promise.all(tasks);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (error) {
      this.log(`${chalk.redBright(`错误：${error.message}`)}`);
      throw error;
    }
  }
}

(async () => {
  try {
    const bot = new Stork();
    await bot.main();
  } catch (error) {
    console.log(
      `${chalk.cyanBright(`[ ${moment().tz(wib).format('MM/DD/YY HH:mm:ss z')} ]`)}${chalk.whiteBright(
        ' | '
      )}${chalk.redBright('[ 退出 ] Stork - 机器人')}`
    );
  }
})();
