# clone-website-elementor

Skill dành cho AI agent (Claude Code, Codex/GPT, OpenMausBot). Skill dựng lại một trang web có sẵn thành trang Elementor:

- dựng ngay trên site WordPress đang chạy;
- giữ nguyên theme đang cài;
- dùng được với Elementor Free hoặc Pro.

## Thư mục

- `SKILL.md` là quy trình chính.
- `references/` là tài liệu tra cứu: cách dựng bằng Elementor, cách truy cập site, cách soi trang gốc, hiệu ứng chuyển động.
- `scripts/elementor-controls.php` liệt kê site đang có gì và in ra tên các control của widget.
- `scripts/elementor-import.php` nhập JSON của trang vào Elementor qua WP-CLI.
- `scripts/extract-source.js` chạy trong trình duyệt để trích xuất trang nguồn: các section, kích thước, font, màu, độ mờ, ảnh, link và breakpoint; mọi nút/link với màu nền, viền, thời gian transition; lớp nổi cố định (chat, nút đăng ký ghim cạnh); widget bên thứ ba; và mọi rule hover/mở cùng keyframes của chúng.
- `scripts/render-page.php` dựng HTML của trang nháp để chụp màn hình so sánh mà không cần đăng nhập.
- `scripts/compare-extracts.mjs` so sánh hai file trích xuất (trang nguồn và trang đã dựng) bằng số: vị trí, kích thước, font, màu, độ mờ của từng section và từng đoạn chữ; màu/viền/transition của từng nút; lớp nổi và widget bên thứ ba.

## Cài vào OpenMausBot

Vào **Bot → Kỹ năng → Nhập kỹ năng**, dán `hiennd5989/clone-website-elementor`, rồi bật kỹ năng cho bot.
