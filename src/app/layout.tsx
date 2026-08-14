import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8fe" },
    { media: "(prefers-color-scheme: dark)", color: "#111116" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "MarkScan — Xóa Watermark & Logo Ảnh Bằng AI (100% Cục Bộ, Giá Siêu Rẻ & Bảo Mật)",
  description:
    "Công cụ xóa watermark, xóa logo và chữ trên hình ảnh bằng công nghệ AI LaMA Inpainting trực tiếp trong trình duyệt. Không tải ảnh lên máy chủ, bảo mật 100%, chi phí siêu rẻ chỉ từ 25k/tháng, giữ nguyên chất lượng 4K.",
  keywords: [
    "xóa watermark",
    "xóa logo ảnh",
    "xóa hình mờ",
    "remove watermark",
    "xóa chữ trên ảnh",
    "AI inpainting",
    "lama inpaint",
    "xóa watermark giá rẻ",
    "xóa logo giá rẻ",
    "bảo mật ảnh",
    "xóa logo không mất chi tiết",
  ],
  authors: [{ name: "MarkScan Team" }],
  creator: "MarkScan AI",
  publisher: "MarkScan",
  metadataBase: new URL("https://markscan.local"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "MarkScan — Xóa Watermark & Logo Ảnh Bằng AI Giá Siêu Rẻ",
    description:
      "Tự động phát hiện và xóa watermark/logo trên ảnh bằng AI Inpainting. 100% xử lý tại máy khách, bảo mật tuyệt đối, chi phí cực rẻ chỉ từ 25k.",
    url: "https://markscan.local",
    siteName: "MarkScan AI",
    locale: "vi_VN",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MarkScan - Xóa Watermark & Logo Bằng AI Giá Siêu Rẻ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MarkScan — Xóa Watermark & Logo Bằng AI Giá Siêu Rẻ",
    description:
      "Xóa hình mờ, logo trên hàng loạt ảnh với AI LaMA trực tiếp trong trình duyệt. Không upload server, giá siêu rẻ từ 25k.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLdData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": "https://markscan.local/#webapp",
      name: "MarkScan AI Watermark Remover",
      url: "https://markscan.local",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "All (Web Browser)",
      offers: [
        {
          "@type": "Offer",
          name: "Gói Trải Nghiệm",
          price: "0",
          priceCurrency: "VND",
        },
        {
          "@type": "Offer",
          name: "Gói Pro 1 Tháng",
          price: "25000",
          priceCurrency: "VND",
        },
        {
          "@type": "Offer",
          name: "Gói Pro 3 Tháng",
          price: "50000",
          priceCurrency: "VND",
        },
      ],
      description:
        "Ứng dụng web AI phát hiện và xóa watermark, logo trên hình ảnh trực tiếp trong trình duyệt, bảo vệ quyền riêng tư 100% với chi phí siêu rẻ.",
      featureList: [
        "Xử lý 100% Client-Side không tải ảnh lên máy chủ",
        "Công nghệ phục hồi AI LaMA Inpainting độ nét cao",
        "Xử lý hàng loạt nhiều ảnh cùng lúc",
        "Tự động quét và phát hiện watermark chuẩn xác",
        "Bảng giá siêu rẻ chỉ từ 25.000đ/tháng",
      ],
    },
    {
      "@type": "HowTo",
      name: "Cách xóa watermark trên hình ảnh giá siêu rẻ bằng MarkScan",
      description: "Quy trình 3 bước đơn giản để tẩy sạch watermark hoặc logo trên ảnh mà không giảm chất lượng.",
      step: [
        {
          "@type": "HowToStep",
          name: "Bước 1: Chọn hoặc kéo thả ảnh",
          text: "Tải một hoặc nhiều hình ảnh (JPG, PNG, WebP) vào khu vực kéo thả của MarkScan.",
          position: 1,
        },
        {
          "@type": "HowToStep",
          name: "Bước 2: AI tự động nhận diện và xử lý",
          text: "Hệ thống AI tự động phát hiện vùng watermark và dùng thuật toán LaMA Inpainting để tái tạo chi tiết gốc.",
          position: 2,
        },
        {
          "@type": "HowToStep",
          name: "Bước 3: Tải ảnh sạch về máy",
          text: "Xem trước kết quả so sánh trước/sau bằng thanh trượt kéo qua lại và tải xuống ảnh đã làm sạch.",
          position: 3,
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "MarkScan có tải hình ảnh của tôi lên máy chủ không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Hoàn toàn không. MarkScan thực thi thuật toán phân tích và inpainting trực tiếp ngay trong trình duyệt của bạn (Client-Side). Ảnh của bạn không bao giờ rời khỏi thiết bị.",
          },
        },
        {
          "@type": "Question",
          name: "Chi phí sử dụng MarkScan như thế nào?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "MarkScan cung cấp gói trải nghiệm miễn phí 10 lượt/ngày cùng các gói Pro nâng cấp siêu rẻ: chỉ 25k/1 tháng và 50k/3 tháng không giới hạn.",
          },
        },
        {
          "@type": "Question",
          name: "MarkScan hỗ trợ những định dạng ảnh nào?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "MarkScan hỗ trợ các định dạng ảnh phổ biến nhất hiện nay bao gồm JPEG, PNG và WebP với độ phân giải cao.",
          },
        },
        {
          "@type": "Question",
          name: "Chất lượng ảnh sau khi xóa watermark có bị giảm không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Không. MarkScan giữ nguyên độ phân giải gốc và chỉ tái tạo khu vực bị che khuất bởi watermark bằng mạng nơ-ron AI LaMA.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
