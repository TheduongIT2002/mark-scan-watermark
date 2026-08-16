# MarkScan Production Operations Note

> Cập nhật lần cuối: 2026-08-16 (Asia/Bangkok)
> Mục đích: lưu trạng thái production và các thay đổi hạ tầng để những nhiệm vụ sau không triển khai nhầm cấu hình.

## 1. Trạng thái đang chạy

| Hạng mục | Giá trị |
| --- | --- |
| Production URL | `https://duongpt.io.vn` |
| Git branch | `master` |
| Source commit | `a585552260cf2d2141b814c57bff3bc371f36657` |
| Frontend release | `/var/www/remove-watermark/releases/20260815T150650Z-a585552` |
| Frontend symlink | `/var/www/remove-watermark/current` |
| Source checkout trên VPS | `/opt/markscan` |
| AI service | `markscan-ai.service` |
| AI listen address | `127.0.0.1:8384` |
| Nginx site | `/etc/nginx/sites-available/remove-watermark` |
| Nginx enabled link | `/etc/nginx/sites-enabled/remove-watermark` |
| AI engine/device | Big LaMa / CPU |

Không lưu AWS account ID, instance ID, private key, token, mật khẩu hoặc IP quản trị vào repository này.

## 2. Thông tin VPS đã quan sát

- AWS EC2 instance type: `t3.micro`.
- Hệ điều hành: Ubuntu 26.04 LTS.
- Cấu hình loại instance: 2 vCPU, 1 GiB RAM, CPU burstable.
- Root filesystem: khoảng 6.7 GiB.
- Tại lần deploy `a585552`: ổ đĩa dùng khoảng 88%, còn khoảng 870 MiB.
- Tại lúc đăng nhập trước deployment: RAM dùng khoảng 70%, swap khoảng 49%.
- AI model và Python virtual environment nằm dưới `/opt/markscan/ai-service` và cache của user `ubuntu`.

Các số liệu dung lượng, RAM, swap và CPU credit là snapshot tại thời điểm kiểm tra; phải đo lại trước mỗi deployment lớn.

## 3. Thay đổi đã triển khai trong commit `a585552`

### Nginx

Nguồn cấu hình chuẩn trong repository: `deploy/nginx.conf`.

- Rate limit AI theo IP: `30r/m`.
- Burst: `60`, sử dụng `nodelay`.
- Request vượt giới hạn trả HTTP `429`.
- `/api/ai/health` là location riêng và không bị tính vào rate limit AI.
- Health proxy timeout: connect `5s`, read `10s`.
- Inpaint proxy timeout: connect `10s`, read/send `600s`.
- Kích thước request tối đa tại Nginx: `70m`.
- Frontend static root: `/var/www/remove-watermark/current`.
- HTTP tự chuyển sang HTTPS.

Bản Nginx trước deployment được sao lưu tại:

```text
/etc/nginx/sites-available/remove-watermark.bak-a585552
```

### AI service

Nguồn service unit chuẩn: `deploy/markscan-ai.service`.

- Chạy bằng user/group `ubuntu`.
- Working directory: `/opt/markscan/ai-service`.
- Uvicorn listen nội bộ tại `127.0.0.1:8384`.
- `MARKSCAN_AI_DEVICE=cpu`.
- Chỉ cho phép các origin production và localhost đã cấu hình.
- Có `asyncio.Lock` toàn cục: tại một thời điểm chỉ chạy một inference Big LaMa.
- Công việc CPU chạy qua `asyncio.to_thread`, do đó event loop và health endpoint vẫn phản hồi khi inference đang bận.
- Health response có các trường: `status`, `engine`, `model_loaded`, `device`, `busy`.
- Inpaint response có header `X-Inpaint-Engine` và `X-Processing-Time-Ms`.
- File tối đa tại FastAPI: 32 MiB cho image và 32 MiB cho mask.
- Độ phân giải tối đa: 36 triệu pixel.

### Frontend AI client

File: `src/lib/inpainter/lama-client.ts`.

- Retry các lỗi tạm thời: `429`, `502`, `503`, `504` và network error.
- Số lần retry mặc định: 3.
- Exponential backoff: bắt đầu 500 ms, tối đa 8 giây.
- Hỗ trợ header `Retry-After` và `AbortSignal`.
- Production endpoint được build thành `/api/ai`.

## 4. Nguyên nhân lỗi batch production trước đây

Nguyên nhân chính đã được xác nhận không phải chất lượng model hoặc thiếu RAM trực tiếp:

1. Nginx cũ giới hạn `2r/m`, burst `2` cho toàn bộ `/api/ai/`.
2. Health check cũng tiêu thụ rate-limit slot.
3. Khi gửi từ 3 đến 5 ảnh, các request sau bị Nginx trả `503`.
4. Frontend chuyển sang thuật toán fallback phía browser.
5. Fallback tạo kết quả mờ/nhòe, khiến production khác local dù dùng cùng ảnh.

Bản mới tách health khỏi limiter, tăng rate/burst, xếp hàng inference phía server và retry lỗi tạm thời phía client.

## 5. Kết quả kiểm thử production

### Smoke test sau deployment

- 6/6 health request liên tiếp: HTTP `200`.
- Batch 5 ảnh đồng thời: 5/5 HTTP `200`.
- Tất cả response ảnh có engine `big-lama`.
- Health vẫn trả `200` và `busy: true` khi batch đang chạy.
- Homepage trả HTTP `200` và có `Last-Modified` mới của release.
- `nginx` và `markscan-ai.service` đều ở trạng thái `active`.

### Benchmark 10 ảnh đồng thời (model đã warm)

Ngày đo: 2026-08-15/16, trực tiếp qua `https://duongpt.io.vn/api/ai/v1/inpaint`.

| Chỉ số | Kết quả |
| --- | ---: |
| Thành công | 10/10 ảnh |
| Tổng wall time | 76.4 giây |
| Thông lượng đo được | khoảng 7.85 ảnh/phút |
| Latency trung bình/request | khoảng 49.5 giây |
| Latency trung vị/request | khoảng 50.9 giây |
| Request lâu nhất | khoảng 76.4 giây |
| Health trong lúc bận | 10/10 HTTP `200` |
| Health latency | khoảng 0.87-1.13 giây |

Kết quả phụ thuộc kích thước ảnh, vùng mask, CPU credit, RAM/swap và tải hệ thống.

## 6. Giới hạn tải hiện tại

- Inference concurrency thực tế: 1 ảnh tại một thời điểm trên toàn server.
- Mức vận hành tốt: khoảng 10 ảnh đang chờ trên toàn hệ thống.
- Mức có thể chấp nhận ngắn hạn: khoảng 20 ảnh, dự kiến 2-3 phút với ảnh tương tự benchmark.
- Trên 40-50 ảnh đồng thời: rủi ro cao về thời gian chờ, RAM/swap và CPU credit.
- 10 user x 10 ảnh = 100 ảnh đồng thời: không an toàn với cấu hình hiện tại.
- Với thông lượng benchmark, 100 ảnh cần tối thiểu khoảng 12 phút 44 giây khi CPU chưa bị giảm tốc.
- Nginx timeout là 600 giây, nên các request cuối hàng đợi 100 ảnh có thể bị `504`.
- Nếu nhiều user dùng chung một public IP/NAT, rate limit theo IP có thể trả `429` khi burst vượt 60.
- Application hiện chưa có persistent job queue hoặc hard queue-size limit. Request chờ được giữ trong HTTP connection cho tới khi hoàn thành hoặc timeout.

Không tăng riêng timeout để giải quyết tải. Hướng nâng cấp đúng là persistent job queue, trả `jobId`, polling/WebSocket, backpressure, quota theo user và worker có tài nguyên lớn hơn.

## 7. Quy trình deployment hiện tại

### Chuẩn bị

```bash
cd /opt/markscan
git status -sb
git pull --ff-only origin master
git rev-parse --short HEAD
df -h /
```

Không build Next.js trực tiếp trên VPS hiện tại: `npm ci` đã từng thất bại với `ENOSPC`. Build frontend ở local với:

```powershell
$env:NEXT_PUBLIC_MARKSCAN_AI_URL='/api/ai'
npm run build
```

Sau đó đóng gói nội dung `out/`, chuyển lên VPS và giải nén thành một thư mục release mới dưới `/var/www/remove-watermark/releases/`. Chỉ đổi symlink `current` sau khi giải nén thành công.

### Cập nhật AI service

```bash
cd /opt/markscan
ai-service/.venv/bin/python -m py_compile ai-service/server.py
sudo systemctl daemon-reload
sudo systemctl restart markscan-ai.service
sudo systemctl is-active markscan-ai.service
```

### Cập nhật Nginx

Luôn sao lưu file đang chạy, cài file từ repository và test trước khi reload:

```bash
sudo cp /etc/nginx/sites-available/remove-watermark /etc/nginx/sites-available/remove-watermark.bak-<commit>
sudo install -m 0644 deploy/nginx.conf /etc/nginx/sites-available/remove-watermark
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl is-active nginx
```

### Smoke test bắt buộc

```bash
for i in {1..6}; do
  curl -sS https://duongpt.io.vn/api/ai/health
  echo
done
```

Ngoài health test, phải chạy ít nhất một batch 5-10 ảnh thật và xác minh:

- Tất cả response là HTTP `200`.
- Header `X-Inpaint-Engine` là `big-lama`.
- Health vẫn trả `200` khi `busy: true`.
- Homepage và static assets trả `200`.
- Không có `429`, `503`, `504` bất thường.

## 8. Rollback

Release trước `a585552` được quan sát là:

```text
/var/www/remove-watermark/releases/20260814T150223Z
```

Trước khi rollback phải kiểm tra thư mục còn tồn tại. Có thể chuyển symlink atomically về release đã xác minh, sau đó reload Nginx. Nếu rollback AI/Nginx, dùng Git commit tương ứng và file backup đã lưu; không chỉ rollback frontend.

## 9. Truy cập và bảo mật

- Security Group public chỉ cần HTTP `80` và HTTPS `443`.
- SSH `22` phải giới hạn theo IP quản trị `/32`; không dùng `0.0.0.0/0`.
- Rule AWS EC2 Instance Connect chỉ được thêm tạm khi cần và phải xóa ngay sau deployment.
- Rule EC2 Instance Connect tạm dùng trong deployment `a585552` đã được xóa.
- Nhánh Git chứa artifact deployment tạm đã được xóa sau khi VPS tải xong.
- Không commit private key, `.pem`, `.ppk`, token, AWS account ID hoặc thông tin đăng nhập.

## 10. Việc cần ưu tiên tiếp theo

1. Tăng dung lượng EBS vì ổ root đã dùng khoảng 88%.
2. Thêm monitoring cho disk, RAM, swap, CPU utilization, `CPUCreditBalance`, HTTP `429/5xx` và queue time.
3. Triển khai persistent job queue trước khi mở cho nhiều user đồng thời.
4. Đặt hard limit cho queue và trả `429` kèm `Retry-After` khi đầy.
5. Thêm per-user quota/rate limit thay vì chỉ dựa trên IP.
6. Cân nhắc worker tối thiểu 4 vCPU/8 GiB RAM hoặc GPU nếu mục tiêu là 10 user x 10 ảnh đồng thời.
7. Tự động hóa build artifact, release symlink, health check và rollback trong CI/CD.
