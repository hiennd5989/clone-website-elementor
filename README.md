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
- `scripts/extract-source.js` chạy trong trình duyệt để trích xuất trang nguồn: các section, kích thước, font, màu, ảnh, link và breakpoint.
- `scripts/render-page.php` dựng HTML của trang nháp để chụp màn hình so sánh mà không cần đăng nhập.

## Cài vào OpenMausBot

Vào **Bot → Kỹ năng → Nhập kỹ năng**, dán `owner/clone-website-elementor`, rồi bật kỹ năng cho bot.
