"""
Web Browser Engineering — Chapter 1: Downloading Web Pages
当前进度: §1 Connecting to a Server 完成（URL 类：scheme + host + path）

教材原文: https://browser.engineering/http.html
"""


class URL:
    def __init__(self, url):
        # ===== §1 第一段：scheme 解析 =====
        # split("://", 1) 最多切 1 次 → [scheme, rest]
        # 解构赋值同时给 self.scheme 和 url（局部变量被覆盖）
        self.scheme, url = url.split("://", 1)
        # 这一版只支持 http；其他 scheme 直接崩
        assert self.scheme == "http"

        # ===== §1 第二段：host / path 分离 =====
        # 边界处理：bare host（如 "example.com" 无路径）→ 补一个 /
        if "/" not in url:
            url = url + "/"
        # 第一个 / 切一刀 → [host, "剩下的"]
        # split 把 / 吃掉了，所以下面要手动拼回开头的 /
        self.host, url = url.split("/", 1)
        # path 必须以 / 开头（HTTP 协议规定）
        # 注意：query (?xxx) 和 hash (#xxx) 这一版都被打包进 path 里，
        # 不单独处理。生产级浏览器会拆得更细
        self.path = "/" + url


if __name__ == "__main__":
    # 测试用例：覆盖正常 / 边界 / 报错 三类情况
    test_urls = [
        "http://example.com/",                       # 正常：根路径
        "http://example.com/foo/bar",                # 正常：多层路径
        "http://example.com/foo/bar?q=1",            # query 被打包进 path
        "http://example.com",                        # 边界：bare host，会被补 /
        "https://example.com/",                      # 报错：scheme 不是 http
        "example.com",                               # 报错：没有 ://，scheme 解析就崩
    ]
    for u in test_urls:
        print(f"测试: {u}")
        try:
            url = URL(u)
            print(f"  scheme = {url.scheme!r}")
            print(f"  host   = {url.host!r}")
            print(f"  path   = {url.path!r}")
        except Exception as e:
            print(f"  崩了: {type(e).__name__}: {e}")
        print()
