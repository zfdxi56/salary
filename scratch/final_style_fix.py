import os

def final_style_fix():
    file_path = r'f:\可\網頁開發\salary\style.css'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix tab-nav
    import re
    
    # Replace .tab-nav block
    content = re.sub(r'\.tab-nav\s*\{[^}]+\}', 
        """.tab-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: var(--tab-height);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 0.5rem;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
}""", content)

    # Fix filter-chip.active
    content = re.sub(r'\.filter-chip\.active\s*\{[^}]+\}', 
        """.filter-chip.active {
  background: var(--green-dark);
  color: white;
  border-color: var(--green-dark);
  box-shadow: 0 4px 10px rgba(21, 128, 61, 0.3);
}""", content)

    # Fix fab-container display
    content = content.replace(".fab-container { display: none !important; }", ".fab-container { display: flex; }")
    
    # Fix scattered titles - reduce padding in composite cards
    content = content.replace("padding: 1.5rem;", "padding: 1rem;")
    content = content.replace("gap: 1.5rem;", "gap: 0.75rem;")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Final style fix applied")

if __name__ == "__main__":
    final_style_fix()
