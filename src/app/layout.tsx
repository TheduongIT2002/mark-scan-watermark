import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"MarkScan — Local watermark & logo detection",description:"Batch-detect visible watermark and logo marks locally in your browser while preserving original image bytes."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
