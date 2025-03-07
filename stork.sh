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
        echo "退出脚本，请按键盘 ctrl + C 退出即可"
        echo "请选择要执行的操作:"
        echo "1. 部署 stork 节点"
        echo "2. 退出脚本"
        echo "================================================================"
        read -p "请输入选择 (1/2): " choice

        case $choice in
            1)  deploy_stork_node ;;
            2)  exit ;;
            *)  echo "无效选择，请重新输入！"; sleep 2 ;;
        esac
    done
}

# 检测并安装环境依赖
function install_dependencies() {
    echo "正在检测系统环境依赖..."

    # 检测并安装 git
    if ! command -v git &> /dev/null; then
        echo "未找到 git，正在安装 git..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        elif command -v brew &> /dev/null; then
            brew install git
        else
            echo "无法自动安装 git，请手动安装 git 后重试。"
            exit 1
        fi
        echo "git 安装完成！"
    else
        echo "git 已安装。"
    fi

    # 检测并安装 node 和 npm
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        echo "未找到 node 或 npm，正在安装 node 和 npm..."
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo -E bash -
            sudo yum install -y nodejs
        elif command -v brew &> /dev/null; then
            brew install node
        else
            echo "无法自动安装 node 和 npm，请手动安装 node 和 npm 后重试。"
            exit 1
        fi
        echo "node 和 npm 安装完成！"
    else
        echo "node 和 npm 已安装。"
    fi

    # 检测并安装 screen
    if ! command -v screen &> /dev/null; then
        echo "未找到 screen，正在安装 screen..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y screen
        elif command -v yum &> /dev/null; then
            sudo yum install -y screen
        elif command -v brew &> /dev/null; then
            brew install screen
        else
            echo "无法自动安装 screen，请手动安装 screen 后重试。"
            exit 1
        fi
        echo "screen 安装完成！"
    else
        echo "screen 已安装。"
    fi

    echo "环境依赖检测完成！"
}

# 部署 stork 节点
function deploy_stork_node() {
    # 检测并安装环境依赖
    install_dependencies

    # 拉取仓库
    echo "正在拉取仓库..."

    # 检查目标目录是否存在
    if [ -d "stork" ]; then
        echo "检测到 stork 目录已存在。"
        read -p "是否删除旧目录并重新拉取仓库？(y/n) " delete_old
        if [[ "$delete_old" =~ ^[Yy]$ ]]; then
            echo "正在删除旧目录..."
            rm -rf stork
            echo "旧目录已删除。"
        else
            echo "跳过拉取仓库，使用现有目录。"
            read -n 1 -s -r -p "按任意键继续..."
            return
        fi
    fi

    # 拉取仓库
    if git clone https://github.com/sdohuajia/stork.git; then
        echo "仓库拉取成功！"
    else
        echo "仓库拉取失败，请检查网络连接或仓库地址。"
        read -n 1 -s -r -p "按任意键返回主菜单..."
        main_menu
        return
    fi

    # 让用户输入代理地址
    echo "请输入代理地址（格式如 http://代理账号:代理密码@127.0.0.1:8080），每次输入一个，直接按回车结束输入："
    > "stork/proxy.txt"  # 清空或创建 proxy.txt 文件
    while true; do
        read -p "代理地址（回车结束）：" proxy
        if [ -z "$proxy" ]; then
            break  # 如果用户直接按回车，结束输入
        fi
        echo "$proxy" >> "stork/proxy.txt"  # 将代理地址写入 proxy.txt
    done

    # 检查 wallets.json 是否存在，并提示是否覆盖
    echo "检查钱包配置文件..."
    overwrite="no"
    if [ -f "stork/wallets.json" ]; then
        read -p "wallets.json 已存在，是否要重新输入钱包信息？(y/n) " overwrite
        if [[ "$overwrite" =~ ^[Yy]$ ]]; then
            rm -f "stork/wallets.json"
            echo "已清除旧的钱包信息，请重新输入。"
        else
            echo "使用现有的 wallets.json 文件。"
        fi
    fi

    # 输入钱包信息（如果需要）
    if [ ! -f "stork/wallets.json" ] || [[ "$overwrite" =~ ^[Yy]$ ]]; then
        > "stork/wallets.json"  # 创建或清空文件
        echo "请输入钱包信息，格式必须为：钱包地址,私钥"
        echo "每次输入一个钱包，直接按回车结束输入："
        echo "[" > "stork/wallets.json"  # 开始 JSON 数组
        while true; do
            read -p "钱包地址：" wallet_address
            if [ -z "$wallet_address" ]; then
                if [ -s "stork/wallets.json" ]; then
                    echo "]" >> "stork/wallets.json"  # 结束 JSON 数组
                    break  # 如果 wallets.json 不为空，允许结束
                else
                    echo "钱包地址不能为空，请重新输入！"
                    continue
                fi
            fi

            read -p "私钥：" private_key
            if [ -z "$private_key" ]; then
                echo "私钥不能为空，请重新输入！"
                continue
            fi

            # 将钱包信息写入 wallets.json
            if [ "$(wc -l < "stork/wallets.json")" -gt 1 ]; then
                echo ",{\"address\": \"$wallet_address\", \"privateKey\": \"$private_key\"}" >> "stork/wallets.json"
            else
                echo "{\"address\": \"$wallet_address\", \"privateKey\": \"$private_key\"}" >> "stork/wallets.json"
            fi
            echo "钱包信息已保存。"
        done
    fi

    # 进入目录
    echo "进入项目目录..."
    cd stork || {
        echo "进入目录失败，请检查是否成功拉取仓库。"
        read -n 1 -s -r -p "按任意键返回主菜单..."
        main_menu
        return
    }

    # 安装依赖
    echo "正在使用 npm 安装依赖..."
    if npm install; then
        echo "依赖安装成功！"
    else
        echo "依赖安装失败，请检查网络连接或 npm 配置。"
        read -n 1 -s -r -p "按任意键返回主菜单..."
        main_menu
        return
    fi

    # 提示用户操作完成
    echo "操作完成！代理已保存到 proxy.txt，钱包已保存到 wallets.json，依赖已安装。"

    # 启动项目
    echo "正在启动项目..."
    screen -S layer -dm bash -c "cd ~/stork && npm start"  # 在 screen 会话中启动 npm start
    echo "项目已在 screen 会话中启动。"
    echo "你可以使用以下命令查看运行状态："
    echo "screen -r layer"
    echo "如果需要退出 screen 会话而不终止进程，请按 Ctrl + A，然后按 D 键。"

    # 提示用户按任意键返回主菜单
    read -n 1 -s -r -p "按任意键返回主菜单..."
    main_menu
}

# 调用主菜单函数
main_menu
