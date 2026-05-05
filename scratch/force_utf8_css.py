import os

def force_utf8_css():
    file_path = r'f:\可\網頁開發\salary\style.css'
    try:
        # Try to read as BIG5 then write as UTF-8
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # Try common encodings
        for enc in ['utf-8', 'big5', 'cp950', 'gbk']:
            try:
                text = content.decode(enc)
                print(f"Decoded with {enc}")
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(text)
                return
            except:
                continue
        
        # If all fail, use ignore
        text = content.decode('utf-8', errors='ignore')
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print("Decoded with utf-8 ignore")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    force_utf8_css()
