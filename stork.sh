#!/bin/bash

# 脚本保存路径
SCRIPT_PATH="$HOME/stork.sh"

# 主菜单函数
function main_menu() {
    while true; do
        clear
        echo "脚本由大赌社区哈哈哈哈编写，推特 @ferdie_jhovie，免费开源，请勿相信收费"
        echo "如有问题，可联系推特，仅此只有一个号"
        echo "================================================================"
        echo "退出脚本，请按键盘 Ctrl + C 退出即可"
        echo "请选择要执行的操作:"
        echo "1. 部署 stork 节点"
        echo "2. 监控日志"
        echo "3. 退出脚本"
        echo "================================================================"
        read -p "请输入选择 (1/2/3): " choice

        case $choice in
            1)  deploy_stork_node ;;
            2)  monitor_logs ;;
            3)  exit ;;
            *)  echo "无效选择，请重新输入！"; sleep 2 ;;
        esac
    done
}

# 检测并安装环境依赖
function install_dependencies() {
    echo "正在检测系统环境依赖..."

    # 安装 git
    if ! command -v git &> /dev/null; then
        echo "未找到 git，正在安装..."
        sudo apt-get update && sudo apt-get install -y git
    fi

    # 安装 node & npm
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        echo "未找到 node 或 npm，正在安装..."
        curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # 安装 screen
    if ! command -v screen &> /dev/null; then
        echo "未找到 screen，正在安装..."
        sudo apt-get update && sudo apt-get install -y screen
    fi

    echo "环境依赖检测完成！"
}

# 部署 stork 节点
function deploy_stork_node() {
    install_dependencies

    echo "正在拉取 stork 仓库..."
    if [ -d "stork" ]; then
        read -p "stork 目录已存在，是否删除并重新拉取？(y/n) " delete_old
        if [[ "$delete_old" =~ ^[Yy]$ ]]; then
            rm -rf stork
        else
            echo "使用现有目录"
            return
        fi
    fi

    if ! git clone https://github.com/sdohuajia/stork.git; then
        echo "仓库拉取失败，请检查网络！"
        return
    fi

    echo "请输入代理地址（格式：http://代理账号:代理密码@127.0.0.1:8080）："
    > "stork/proxies.txt"
    while true; do
        read -p "代理地址（回车结束）：" proxy
        [[ -z "$proxy" ]] && break
        echo "$proxy" >> "stork/proxies.txt"
    done

    # 处理账户信息
    echo "检查 accounts.js..."
    if [ -f "stork/accounts.js" ]; then
        read -p "accounts.js 已存在，是否重新输入？(y/n) " overwrite
        [[ "$overwrite" =~ ^[Yy]$ ]] && rm -f "stork/accounts.js"
    fi

    if [ ! -f "stork/accounts.js" ]; then
        echo "export const accounts = [" > "stork/accounts.js"
        while true; do
            read -p "邮箱：" username
            [[ -z "$username" ]] && break
            read -p "密码：" password
            echo "  { username: \"$username\", password: \"$password\" }," >> "stork/accounts.js"
        done
        echo "];" >> "stork/accounts.js"
    fi

    cd stork || exit
    npm install

    # 启动项目，并将输出重定向到日志文件
    screen -S stork -dm bash -c "cd ~/stork && npm start >> /root/stork/logs/output.log 2>&1"

    echo "项目已启动，使用 'screen -r stork' 查看日志"
}

# 日志监控函数
function monitor_logs() {
    echo "正在配置日志监控..."

    MONITOR_SCRIPT="/root/monitor.sh"
    SCREEN_NAME="stork"
    LOG_FILE="/root/stork/logs/output.log"
    MONITOR_LOG="/root/monitor.log"

    cat > "$MONITOR_SCRIPT" <<EOL
#!/bin/bash
echo "日志监控已启动..." > $MONITOR_LOG

while true; do
    if grep -q "Network error" "$LOG_FILE"; then
        echo "\$(date): 检测到 Network error，正在重启服务..." >> $MONITOR_LOG

        # 停止进程
        screen -S "$SCREEN_NAME" -X stuff $'\003'
        sleep 5

        # 清理日志
        > "$LOG_FILE"

        # 重新启动服务
        screen -S "$SCREEN_NAME" -X stuff "npm start"$'\n'
        
        echo "\$(date): 服务已重启" >> $MONITOR_LOG
    fi
    sleep 30
done
EOL

    chmod +x "$MONITOR_SCRIPT"
    nohup "$MONITOR_SCRIPT" > "$MONITOR_LOG" 2>&1 &

    echo "日志监控已启动，后台运行中。"
    echo "查看监控日志：tail -f $MONITOR_LOG"
}

# 启动主菜单
main_menu
