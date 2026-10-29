import os
import sys
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Force 200 OK: remove conditional request headers so server never returns 304
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {args[0]} {args[1]}\n")

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    PORT = 8085
    socketserver.TCPServer.allow_reuse_address = True
    print("=" * 60)
    print(f"  [신규] 광주 버스 노선·정류장 검색 웹 서버 시작")
    print(f"  접속 주소: http://localhost:{PORT}")
    print(f"  캐시 방지(No-Cache / 200 OK 강제) 모드 활성화")
    print("=" * 60)
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버가 종료되었습니다.")
