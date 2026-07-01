import http.server
import socketserver
import os

PORT = 3000
DIRECTORY = r"c:\Users\USER\.gemini\antigravity-ide\scratch\armstrong-motos-pos"

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def translate_path(self, path):
        # First use standard translation
        translated = super().translate_path(path)
        
        # If the file does not exist, check in public directory
        if not os.path.exists(translated):
            # Strip the DIRECTORY prefix to get the relative path
            rel_path = os.path.relpath(translated, DIRECTORY)
            # Try to see if it exists in the 'public' subfolder
            public_path = os.path.join(DIRECTORY, "public", rel_path)
            if os.path.exists(public_path):
                return public_path
                
        return translated

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    # Allow address reuse
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Serving HTTP on port {PORT} from {DIRECTORY}...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
