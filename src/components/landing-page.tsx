"use client";

import { useState } from "react";
import DetectorApp from "@/components/detector-app";
import type { LogoScanner } from "@/lib/scanner/scanner";

interface LandingPageProps {
  scanner?: LogoScanner;
}

export default function LandingPage({ scanner }: LandingPageProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "MarkScan có tải hình ảnh của tôi lên máy chủ không?",
      a: "Hoàn toàn không! MarkScan sử dụng công nghệ WebAssembly và AI LaMA Inpainting để xử lý ảnh trực tiếp 100% trong bộ nhớ trình duyệt máy khách. Dữ liệu hình ảnh của bạn không bao giờ rời khỏi thiết bị.",
    },
    {
      q: "Chi phí sử dụng MarkScan như thế nào?",
      a: "MarkScan cung cấp gói trải nghiệm miễn phí 10 lượt/ngày cùng các gói nâng cấp Pro giá siêu rẻ: chỉ 25k/1 tháng và 50k/3 tháng (tiết kiệm 33%) để xử lý hàng loạt không giới hạn số lượng ảnh.",
    },
    {
      q: "Chất lượng ảnh sau khi tẩy watermark có bị mờ hay giảm độ nét?",
      a: "Không. Thuật toán LaMA (Large Mask Inpainting) chỉ tái tạo chính xác phần điểm ảnh bị che khuất bởi watermark hoặc logo, các vùng còn lại được giữ nguyên 100% chất lượng gốc.",
    },
    {
      q: "MarkScan có hỗ trợ xóa chữ, ngày tháng hoặc vật thể lạ không?",
      a: "Có. Ngoài watermark và logo của các nền tảng (Shutterstock, Getty, Canva, v.v.), AI còn có thể loại bỏ dấu mộc đỏ, tem bản quyền, ngày giờ chụp ảnh và văn bản chèn trên ảnh.",
    },
    {
      q: "Tôi có cần cài đặt thêm phần mềm gì không?",
      a: "Không cần cài đặt thêm bất kỳ phần mềm hay plugin nào. Bạn chỉ cần mở trình duyệt web (Chrome, Edge, Safari, Firefox) trên máy tính hoặc điện thoại là có thể sử dụng ngay.",
    },
  ];

  return (
    <div className="landing-wrapper">
      {/* Top Floating Navbar */}
      <nav className="landing-nav" aria-label="Điều hướng chính">
        <div className="nav-container">
          <a href="#" className="nav-brand">
            <span className="brand-icon" aria-hidden="true">✦</span>
            <span className="brand-text">MarkScan</span>
            <span className="brand-badge">AI v2.0</span>
          </a>

          <div className="nav-links">
            <a href="#cong-cu">Công cụ AI</a>
            <a href="#tinh-nang">Tính năng</a>
            <a href="#bang-gia">Bảng giá</a>
            <a href="#cach-hoat-dong">Cách hoạt động</a>
            <a href="#faq">Hỏi đáp</a>
          </div>

          <div className="nav-cta">
            <a href="#bang-gia" className="nav-btn-primary">
              Xem bảng giá
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="hero-glow-1" aria-hidden="true" />
        <div className="hero-glow-2" aria-hidden="true" />

        <div className="hero-container">
          <div className="hero-badge">
            <span className="badge-pulse" />
            <span>AI Inpainting 2026 • Giá Siêu Rẻ • 100% Cục Bộ</span>
          </div>

          <h1 className="hero-title">
            Xóa Watermark & Logo Hình Ảnh
            <span className="gradient-text"> Bằng AI Đỉnh Cao</span>
          </h1>

          <p className="hero-desc">
            Tự động phát hiện và xóa sạch hình mờ, logo thương hiệu, tem bản quyền và chữ trên ảnh 
            chỉ trong tích tắc. Chi phí siêu rẻ, giữ nguyên độ phân giải gốc 4K và hoàn toàn <strong>không tải ảnh lên máy chủ</strong>.
          </p>

          <div className="hero-actions">
            <a href="#cong-cu" className="hero-btn-primary">
              <span aria-hidden="true">✨</span> Bắt đầu xóa Watermark
            </a>
            <a href="#bang-gia" className="hero-btn-secondary">
              <span aria-hidden="true">🏷️</span> Xem bảng giá siêu rẻ
            </a>
          </div>

          {/* Trust Highlights */}
          <div className="hero-trust-grid">
            <div className="trust-item">
              <span className="trust-icon" aria-hidden="true">🛡️</span>
              <div className="trust-text">
                <strong>100% Riêng tư</strong>
                <span>Xử lý tại trình duyệt</span>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon" aria-hidden="true">⚡</span>
              <div className="trust-text">
                <strong>Tốc độ cực nhanh</strong>
                <span>Tăng tốc phần cứng GPU</span>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon" aria-hidden="true">💎</span>
              <div className="trust-text">
                <strong>Chất lượng gốc 4K</strong>
                <span>Không nén mờ ảnh</span>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon" aria-hidden="true">🏷️</span>
              <div className="trust-text">
                <strong>Chi phí siêu rẻ</strong>
                <span>Chỉ từ 25k/tháng</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Core Application Workspace Section */}
      <section id="cong-cu" className="app-section">
        <div className="app-container">
          <div className="section-header">
            <span className="section-kicker">KHÔNG GIAN LÀM VIỆC TRỰC TIẾP</span>
            <h2 className="section-title">Kéo thả ảnh để AI xử lý ngay</h2>
            <p className="section-subtitle">
              Chọn một hoặc nhiều tệp ảnh (JPG, PNG, WebP) để hệ thống tự động quét và tẩy watermark.
            </p>
          </div>

          <div className="app-card-wrapper">
            <div className="app-card-header">
              <div className="app-card-dots">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>
              <span className="app-card-title">MarkScan AI Workspace — Client-Side Inpainter</span>
              <span className="app-card-shield">🔒 Zero Server Upload</span>
            </div>

            <div className="app-card-body">
              <DetectorApp scanner={scanner} />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Visual Comparison Slider Section */}
      <section id="demo" className="demo-section">
        <div className="demo-container">
          <div className="section-header">
            <span className="section-kicker">KẾT QUẢ THỰC TẾ</span>
            <h2 className="section-title">So sánh Trước & Sau khi xóa Watermark</h2>
            <p className="section-subtitle">
              Kéo thanh trượt để cảm nhận độ chi tiết và sự liền mạch của thuật toán AI LaMA Inpainting.
            </p>
          </div>

          <div className="slider-wrapper">
            <div className="slider-box" style={{ "--pos": `${sliderPos}%` } as React.CSSProperties}>
              {/* After image (Clean) */}
              <div className="slider-layer slider-after">
                <div className="sample-art clean-art">
                  <div className="art-sun" />
                  <div className="art-mountain-bg" />
                  <div className="art-mountain-fg" />
                  <div className="art-lake" />
                  <span className="slider-tag tag-after">ĐÃ XÓA WATERMARK (SAU)</span>
                </div>
              </div>

              {/* Before image (Watermarked) */}
              <div className="slider-layer slider-before" style={{ width: `${sliderPos}%` }}>
                <div className="sample-art dirty-art">
                  <div className="art-sun" />
                  <div className="art-mountain-bg" />
                  <div className="art-mountain-fg" />
                  <div className="art-lake" />
                  <div className="watermark-overlay" aria-hidden="true">
                    <span>SAMPLE WATERMARK © 2026</span>
                    <span>CONFIDENTIAL • PREVIEW</span>
                    <span>PROTECTED IMAGE</span>
                  </div>
                  <span className="slider-tag tag-before">ẢNH GỐC CÓ WATERMARK (TRƯỚC)</span>
                </div>
              </div>

              {/* Divider Handle */}
              <div className="slider-divider" style={{ left: `${sliderPos}%` }}>
                <div className="slider-button" aria-label="Kéo để so sánh trước sau">
                  <span aria-hidden="true">◀ ▶</span>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="slider-range-input"
                aria-label="Điều chỉnh tỷ lệ so sánh trước và sau"
              />
            </div>

            <div className="slider-caption">
              💡 <em>Kéo thanh trượt qua trái hoặc phải để xem khả năng tái tạo vùng ảnh bị che khuất một cách tự nhiên.</em>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Grid */}
      <section id="tinh-nang" className="features-section">
        <div className="features-container">
          <div className="section-header">
            <span className="section-kicker">TẠI SAO CHỌN MARKSCAN</span>
            <h2 className="section-title">Công nghệ xử lý vượt trội</h2>
            <p className="section-subtitle">
              Sự kết hợp hoàn hảo giữa công nghệ AI tiên tiến, chi phí tiết kiệm và kiến trúc bảo mật máy khách.
            </p>
          </div>

          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">🔒</div>
              <h3 className="feature-title">Bảo Mật Tuyệt Đối 100%</h3>
              <p className="feature-desc">
                Ảnh không bao giờ tải lên bất kỳ máy chủ nào. Mọi thao tác quét và vẽ lại đều diễn ra nội bộ trên CPU/GPU thiết bị của bạn.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">🧠</div>
              <h3 className="feature-title">Mô Hình AI LaMA Hiện Đại</h3>
              <p className="feature-desc">
                Sử dụng mạng nơ-ron Large Mask Inpainting tiên tiến giúp tái tạo lại cấu trúc đường nét và màu sắc nền một cách chân thực nhất.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">🚀</div>
              <h3 className="feature-title">Xử Lý Hàng Loạt Siêu Tốc</h3>
              <p className="feature-desc">
                Dễ dàng tải lên hàng chục bức ảnh cùng lúc. Hệ thống xử lý song song và đóng gói toàn bộ kết quả vào tệp ZIP gọn gàng.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">💎</div>
              <h3 className="feature-title">Giữ Nguyên Chất Lượng Gốc</h3>
              <p className="feature-desc">
                Không nén giảm bitrate, không làm mờ vùng xung quanh. Hỗ trợ đầy đủ các định dạng phổ biến JPG, PNG, WebP chất lượng cao.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">🎯</div>
              <h3 className="feature-title">Tự Động Nhận Diện Thông Minh</h3>
              <p className="feature-desc">
                Hệ thống tự động quét và đánh dấu vị trí các loại watermark phổ biến như logo bản quyền, dấu chìm mờ và chữ nền.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon" aria-hidden="true">🏷️</div>
              <h3 className="feature-title">Chi Phí Cực Rẻ & Tiết Kiệm</h3>
              <p className="feature-desc">
                Trải nghiệm gói cơ bản và nâng cấp gói Pro chỉ từ 25k/tháng, tiết kiệm hơn 90% so với các phần mềm đồ họa đắt đỏ.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 3-Step Workflow Section */}
      <section id="cach-hoat-dong" className="steps-section">
        <div className="steps-container">
          <div className="section-header">
            <span className="section-kicker">QUY TRÌNH ĐƠN GIẢN</span>
            <h2 className="section-title">Xóa Watermark chỉ trong 3 bước</h2>
            <p className="section-subtitle">
              Không cần kỹ năng đồ họa phức tạp, bất kỳ ai cũng có thể làm sạch ảnh trong vài giây.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-title">Tải ảnh lên</h3>
              <p className="step-desc">
                Kéo thả hoặc duyệt chọn ảnh từ máy tính/điện thoại vào không gian làm việc của MarkScan.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-title">AI quét & Xử lý</h3>
              <p className="step-desc">
                Nhấn bắt đầu để AI tự động phát hiện vị trí watermark và tiến hành tái tạo vùng ảnh mượt mà.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-title">Tải ảnh sạch về</h3>
              <p className="step-desc">
                Xem trước kết quả phục hồi và tải ảnh đã làm sạch từng ảnh hoặc tải toàn bộ dạng file ZIP.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Table Section (3 Tiers) */}
      <section id="bang-gia" className="pricing-section">
        <div className="pricing-container">
          <div className="section-header">
            <span className="section-kicker">BẢNG GIÁ DỊCH VỤ</span>
            <h2 className="section-title">Bảng giá linh hoạt, chi phí siêu rẻ</h2>
            <p className="section-subtitle">
              Lựa chọn gói dịch vụ phù hợp với bạn. Tiết kiệm tối đa chi phí với công nghệ AI xử lý tại máy khách.
            </p>
          </div>

          <div className="pricing-grid">
            {/* Tier 1: Free */}
            <div className="pricing-card">
              <div className="pricing-header">
                <h3 className="pricing-plan-name">Gói Trải Nghiệm</h3>
                <p className="pricing-plan-desc">Dành cho cá nhân trải nghiệm tính năng xóa watermark cơ bản.</p>
                <div className="pricing-price-wrap">
                  <span className="pricing-amount">0đ</span>
                  <span className="pricing-period">/ vĩnh viễn</span>
                </div>
              </div>

              <ul className="pricing-features">
                <li><span className="feature-check" aria-hidden="true">✓</span> <strong>Giới hạn 10 lượt miễn phí / 1 ngày</strong></li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Xóa watermark & logo cơ bản</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> 100% Cục bộ & Bảo mật dữ liệu</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Hỗ trợ định dạng JPG, PNG, WebP</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Giữ nguyên chất lượng ảnh 4K</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Tải về từng ảnh đơn lẻ</li>
              </ul>

              <a href="#cong-cu" className="pricing-btn secondary">
                Bắt đầu trải nghiệm
              </a>
            </div>

            {/* Tier 2: 25k / 1 month (Featured) */}
            <div className="pricing-card featured">
              <div className="pricing-badge">🔥 Phổ Biến Nhất</div>
              <div className="pricing-header">
                <h3 className="pricing-plan-name">Gói Pro Tháng</h3>
                <p className="pricing-plan-desc">Phù hợp cho nhà sáng tạo nội dung, nhiếp ảnh gia và bán hàng online.</p>
                <div className="pricing-price-wrap">
                  <span className="pricing-amount">25.000đ</span>
                  <span className="pricing-period">/ 1 tháng</span>
                </div>
              </div>

              <ul className="pricing-features">
                <li><span className="feature-check" aria-hidden="true">✓</span> Tất cả quyền lợi gói Trải Nghiệm</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> <strong>Xử lý hàng loạt không giới hạn</strong></li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Tăng tốc độ AI LaMA Inpainting</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Đóng gói & tải về file ZIP hàng loạt</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Hỗ trợ kỹ thuật ưu tiên 24/7</li>
              </ul>

              <a href="#cong-cu" className="pricing-btn primary">
                Đăng ký gói 1 tháng
              </a>
            </div>

            {/* Tier 3: 50k / 3 months (Best Value) */}
            <div className="pricing-card">
              <div className="pricing-badge savings">💎 Siêu Tiết Kiệm</div>
              <div className="pricing-header">
                <h3 className="pricing-plan-name">Gói Pro 3 Tháng</h3>
                <p className="pricing-plan-desc">Tiết kiệm nhất cho người dùng thường xuyên và doanh nghiệp nhỏ.</p>
                <div className="pricing-price-wrap">
                  <span className="pricing-amount">50.000đ</span>
                  <span className="pricing-period">/ 3 tháng (~16k/tháng)</span>
                </div>
              </div>

              <ul className="pricing-features">
                <li><span className="feature-check" aria-hidden="true">✓</span> <strong>Toàn bộ tính năng gói Pro</strong></li>
                <li><span className="feature-check" aria-hidden="true">✓</span> <strong>Tiết kiệm 33%</strong> chi phí</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Xử lý ảnh kích thước siêu lớn không giới hạn</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Tự động nâng cấp mô hình AI mới nhất</li>
                <li><span className="feature-check" aria-hidden="true">✓</span> Ưu tiên hỗ trợ kỹ thuật VIP trực tiếp</li>
              </ul>

              <a href="#cong-cu" className="pricing-btn secondary">
                Đăng ký gói 3 tháng
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="faq-section">
        <div className="faq-container">
          <div className="section-header">
            <span className="section-kicker">GIẢI ĐÁP THẮC MẮC</span>
            <h2 className="section-title">Câu hỏi thường gặp (FAQ)</h2>
            <p className="section-subtitle">
              Mọi điều bạn cần biết về nguyên lý hoạt động, bảng giá và tính năng của MarkScan.
            </p>
          </div>

          <div className="faq-list">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`faq-item ${openFaq === idx ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  aria-expanded={openFaq === idx}
                >
                  <span>{faq.q}</span>
                  <span className="faq-toggle-icon" aria-hidden="true">
                    {openFaq === idx ? "−" : "+"}
                  </span>
                </button>
                {openFaq === idx && (
                  <div className="faq-answer">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call To Action Banner */}
      <section className="cta-banner-section">
        <div className="cta-banner-container">
          <div className="cta-banner-card">
            <h2 className="cta-banner-title">Sẵn sàng làm sạch những bức ảnh của bạn?</h2>
            <p className="cta-banner-desc">
              Trải nghiệm công nghệ AI Inpainting với chi phí siêu rẻ, nhanh chóng và an toàn tuyệt đối ngay bây giờ.
            </p>
            <a href="#cong-cu" className="cta-banner-btn">
              Khám phá ngay — Chi phí siêu rẻ
            </a>
          </div>
        </div>
      </section>

      {/* Rich SEO Footer */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-top">
            <div className="footer-brand-col">
              <a href="#" className="footer-brand">
                <span className="brand-icon" aria-hidden="true">✦</span>
                <span className="brand-text">MarkScan AI</span>
              </a>
              <p className="footer-brand-desc">
                Công cụ xóa watermark và logo hình ảnh trực tiếp trong trình duyệt bằng trí tuệ nhân tạo LaMA Inpainting. 
                Cam kết 100% riêng tư, an toàn dữ liệu và chi phí siêu rẻ.
              </p>
              <div className="footer-status-pill">
                <span className="status-dot-active" />
                <span>AI Engine: Sẵn sàng hoạt động</span>
              </div>
            </div>

            <div className="footer-links-col">
              <h4 className="footer-heading">Chức năng</h4>
              <ul>
                <li><a href="#cong-cu">Trình xóa Watermark AI</a></li>
                <li><a href="#tinh-nang">Tính năng hàng loạt</a></li>
                <li><a href="#demo">So sánh trước sau</a></li>
                <li><a href="#bang-gia">Bảng giá dịch vụ siêu rẻ</a></li>
              </ul>
            </div>

            <div className="footer-links-col">
              <h4 className="footer-heading">Tài nguyên</h4>
              <ul>
                <li><a href="#faq">Câu hỏi thường gặp</a></li>
                <li><a href="#cach-hoat-dong">Hướng dẫn sử dụng</a></li>
                <li><a href="#cong-cu">Tải xuống kết quả ZIP</a></li>
              </ul>
            </div>

            <div className="footer-links-col">
              <h4 className="footer-heading">Bảo mật & Quyền</h4>
              <ul>
                <li><span>✓ 100% Client-Side Memory</span></li>
                <li><span>✓ Zero Server Logging</span></li>
                <li><span>✓ No Cookies Tracking</span></li>
                <li><span>✓ Chi phí tiết kiệm từ 25k</span></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} MarkScan AI. Thiết kế chuẩn SEO & Chi phí siêu rẻ cho mọi người.</p>
            <div className="footer-seo-tags">
              <span>Xóa watermark ảnh</span>
              <span>•</span>
              <span>Xóa watermark giá rẻ</span>
              <span>•</span>
              <span>LaMA Inpainting</span>
              <span>•</span>
              <span>AI Photo Cleaner</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
