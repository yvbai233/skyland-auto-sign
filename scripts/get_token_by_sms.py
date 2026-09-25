"""Obtain a Hypergryph token through SMS login for local development only."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import requests


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKER_ROOT = Path(__file__).resolve().parents[1]
DEV_VARS = WORKER_ROOT / ".dev.vars"
DEV_VARS_EXAMPLE = WORKER_ROOT / ".dev.vars.example"

# Reuse the Python implementation that the original project already trusts.
sys.path.insert(0, str(PROJECT_ROOT))
from SecuritySm import get_d_id  # noqa: E402


SEND_CODE_URL = "https://as.hypergryph.com/general/v1/send_phone_code"
TOKEN_URL = "https://as.hypergryph.com/user/auth/v2/token_by_phone_code"
USER_AGENT = "Skland/1.0.1 (com.hypergryph.skland; build:100001014; Android 31; ) Okhttp/4.11.0"


def response_json(response: requests.Response, action: str) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as error:
        raise RuntimeError(
            f"{action}失败：HTTP {response.status_code}，服务器没有返回 JSON"
        ) from error
    if not isinstance(data, dict):
        raise RuntimeError(f"{action}失败：服务器返回了未知格式")
    return data


def request_token(phone: str) -> str:
    print("正在生成设备标识 dId……")
    try:
        device_id = get_d_id()
    except Exception as error:
        raise RuntimeError(f"生成 dId 失败：{error}") from error
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip",
        "Connection": "close",
        "dId": device_id,
    }

    with requests.Session() as session:
        sent = session.post(
            SEND_CODE_URL,
            json={"phone": phone, "type": 2},
            headers=headers,
            timeout=20,
        )
        sent_data = response_json(sent, "发送验证码")
        if sent.status_code != 200 or sent_data.get("status") != 0:
            message = sent_data.get("msg") or sent_data.get("message") or sent_data
            raise RuntimeError(f"发送验证码失败：{message}")

        print("验证码已发送，请检查短信。")
        code = input("请输入短信验证码：").strip()
        if not re.fullmatch(r"\d{4,8}", code):
            raise RuntimeError("验证码格式不正确")

        result = session.post(
            TOKEN_URL,
            json={"phone": phone, "code": code},
            headers=headers,
            timeout=20,
        )
        result_data = response_json(result, "验证码登录")
        if result.status_code != 200 or result_data.get("status") != 0:
            message = result_data.get("msg") or result_data.get("message") or result_data
            raise RuntimeError(f"验证码登录失败：{message}")

    result_body = result_data.get("data")
    token = result_body.get("token") if isinstance(result_body, dict) else None
    if not isinstance(token, str) or not token:
        raise RuntimeError("登录成功，但响应中没有 Token")
    return token


def decode_dotenv_value(value: str) -> str:
    value = value.strip()
    if value.startswith(('"', "'")):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, str):
                return decoded
        except json.JSONDecodeError:
            pass
    return value


def extract_existing_token(text: str) -> str:
    for line in text.splitlines():
        match = re.match(r"^\s*TOKEN\s*=\s*(.*)$", line)
        if not match:
            continue
        value = decode_dotenv_value(match.group(1))
        try:
            parsed = json.loads(value)
            data = parsed.get("data") if isinstance(parsed, dict) else None
            content = data.get("content") if isinstance(data, dict) else None
            return content if isinstance(content, str) else value
        except json.JSONDecodeError:
            return value
    return ""


def write_dev_vars(token: str) -> None:
    if DEV_VARS.exists():
        text = DEV_VARS.read_text(encoding="utf-8")
    elif DEV_VARS_EXAMPLE.exists():
        text = DEV_VARS_EXAMPLE.read_text(encoding="utf-8")
    else:
        text = 'TOKEN=""\nWORKER_AUTH="replace-with-a-long-random-secret"\n'

    existing = extract_existing_token(text)
    placeholders = {"", "replace-with-your-hypergryph-token", "你的森空岛Token"}
    if existing not in placeholders:
        choice = input(".dev.vars 中已有 Token：[a]追加 / [o]覆盖 / [c]取消（默认 a）：").strip().lower()
        if choice == "c":
            print("已取消写入；Token 仍显示在上方，可手动保存。")
            return
        if choice != "o":
            tokens = [item.strip() for item in re.split(r"[,\n]", existing) if item.strip()]
            if token not in tokens:
                tokens.append(token)
            token = ",".join(tokens)

    replacement = f"TOKEN={json.dumps(token, ensure_ascii=False)}"
    if re.search(r"^\s*TOKEN\s*=.*$", text, flags=re.MULTILINE):
        text = re.sub(r"^\s*TOKEN\s*=.*$", replacement, text, count=1, flags=re.MULTILINE)
    else:
        text = replacement + "\n" + text
    DEV_VARS.write_text(text.rstrip() + "\n", encoding="utf-8")
    print(f"Token 已写入：{DEV_VARS}")
    if "replace-with-a-long-random-secret" in text:
        print("提醒：本地测试前还需要在 .dev.vars 中设置 WORKER_AUTH。")


def main() -> int:
    print("森空岛短信验证码 Token 获取工具（仅在本地运行）")
    phone = input("请输入鹰角通行证手机号：").strip()
    if not re.fullmatch(r"1\d{10}", phone):
        print("错误：请输入 11 位中国大陆手机号。", file=sys.stderr)
        return 1

    try:
        token = request_token(phone)
    except requests.RequestException as error:
        print(f"网络请求失败：{error}", file=sys.stderr)
        return 1
    except RuntimeError as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1

    print("\n登录成功。Token 如下（请勿发送给他人）：")
    print(token)
    if input("\n是否写入 cf-worker/.dev.vars？[y/N]：").strip().lower() == "y":
        write_dev_vars(token)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n已取消。")
        raise SystemExit(130)
