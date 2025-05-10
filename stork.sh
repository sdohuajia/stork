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
        echo "2. 退出脚本"
        echo "================================================================"
        read -p "请输入选择 (1/2): " choice

        case $choice in
            1) deploy_stork_node ;;
            2) exit ;;
            *) echo "无效选择，请重新输入！"; sleep 2 ;;
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

    # 安装 node & npm (使用 Node.js 18.x LTS，更新版本)
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        echo "未找到 node 或 npm，正在安装..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
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

    # 检查 stork 目录和 screen -r stork 是否存在，存在则清理
    node_dir="$HOME/stork"
    echo "正在检查 stork 目录和 screen 会话..."
    if [ -d "$node_dir" ]; then
        echo "检测到 stork 目录存在，正在清理..."
        rm -rf "$node_dir"
    fi
    if screen -ls | grep -q "stork"; then
        echo "检测到 stork screen 会话存在，正在清理..."
        screen -S stork -X quit
    fi

    # 拉取 stork 仓库
    echo "正在拉取 stork 仓库到 $node_dir..."
    if ! git clone https://github.com/sdohuajia/stork.git "$node_dir"; then
        echo "仓库拉取失败，请检查网络！"
        read -n 1 -s -r -p "按任意键返回主菜单..."
        main_menu
        return
    fi

    # 输入代理地址
    echo "请输入代理地址（格式：http://代理账号:代理密码@127.0.0.1:8080）："
    > "$node_dir/proxy.txt"
    while true; do
        read -p "代理地址（回车结束）：" proxy
        [[ -z "$proxy" ]] && break
        echo "$proxy" >> "$node_dir/proxy.txt"
    done

    # 处理账户信息 (生成 accounts.json)
    echo "检查 accounts.json..."
    if [ -f "$node_dir/accounts.json" ]; then
        read -p "accounts.json 已存在，是否重新输入？(y/n) " overwrite
        [[ "$overwrite" =~ ^[Yy]$ ]] && rm -f "$node_dir/accounts.json"
    fi

    if [ ! -f "$node_dir/accounts.json" ]; then
        echo "[" > "$node_dir/accounts.json"
        first_entry=true
        while true; do
            read -p "邮箱：" email
            [[ -z "$email" ]] && break
            read -p "密码：" password
            if [ "$first_entry" = true ]; then
                echo "  {\"Email\": \"$email\", \"Password\": \"$password\"}" >> "$node_dir/accounts.json"
                first_entry=false
            else
                echo ", {\"Email\": \"$email\", \"Password\": \"$password\"}" >> "$node_dir/accounts.json"
            fi
        done
        echo "]" >> "$node_dir/accounts.json"
    fi

    # 安装项目依赖
    cd "$node_dir" || exit
    npm install

    # 启动节点
    screen -S "stork" -dm bash -c "cd $node_dir && npm start"

    echo "节点已启动，使用 'screen -r stork' 查看日志"

    # 提示用户按任意键返回主菜单
    read -n 1 -s -r -p "按任意键返回主菜单..."
    main_menu
}

# 启动主菜单
main_menu
