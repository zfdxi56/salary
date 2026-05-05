import os

def improve_tab_visibility():
    file_path = r'f:\可\網頁開發\salary\style.css'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Improve sub-tab-btn active state
    content = content.replace(".sub-tab-btn.active {", 
        """.sub-tab-btn.active {
  background: var(--green-dark) !important;
  color: white !important;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(21, 128, 61, 0.3);
  border: 1px solid var(--green-dark);
}""")

    # Improve market/order toggle buttons in Modal
    content = content.replace(".modal-type-switcher .seg-btn input:checked + span {",
        """.modal-type-switcher .seg-btn input:checked + span {
  background: var(--green-dark);
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
}""")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Tab visibility improved")

if __name__ == "__main__":
    improve_tab_visibility()
