#!/usr/bin/env python3
"""Serve this static site locally. No build, account, or Internet connection needed."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description='学习手记本地预览')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        parser.exit(1, f'无法启动预览：{error}。可使用 --port 8001 更换端口。\n')
    url = f'http://127.0.0.1:{server.server_address[1]}/'
    print(f'学习手记预览：{url}\n页边切换「经典 / 星空 / 山海」。按 Ctrl+C 停止。', flush=True)
    if not args.no_browser:
        threading.Timer(.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
