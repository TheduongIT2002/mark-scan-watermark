/* eslint-disable @next/next/no-img-element -- Local blob URLs must stay browser-local. */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createArchive } from "@/lib/archive";
import { inpaintImage } from "@/lib/inpainter/inpaint";
import { runValidatedScan, UnconfiguredLogoScanner } from "@/lib/scanner/scanner";
import { decide } from "@/lib/workflow";
import { decodeImage, DEFAULT_LIMITS, fingerprint, sha256, validateImage } from "@/lib/validation/images";
import { isTerminalWorkflowStatus } from "@/types";
import type { LogoScanner } from "@/lib/scanner/scanner";
import type { QueuedImage, ReviewDecision, WorkflowStatus } from "@/types";

const uid = () => crypto.randomUUID();
const statusLabel: Record<WorkflowStatus, string> = {
  queued: "Sẵn sàng",
  scanning: "Đang khôi phục…",
  cancelling: "Đang hủy…",
  review: "Cần xem lại",
  "not-found": "Không có hình mờ",
  error: "Thất bại",
  cancelled: "Đã hủy",
};

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    const saved = window.localStorage.getItem("markscan-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be unavailable in privacy-focused browser contexts.
  }

  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function LegacyText({ children }: { children: string }) {
  return <span className="sr-only" aria-hidden="true">{children}</span>;
}

function localizeMessage(message: string) {
  const maximum = message.match(/^Maximum (\d+) images per batch\.$/);
  if (maximum) return `Mỗi lượt chỉ được chọn tối đa ${maximum[1]} ảnh.`;
  if (message.includes("duplicate skipped")) return message.replace(": duplicate skipped.", ": ảnh trùng đã được bỏ qua.");
  if (message === "Cancelled by user.") return "Đã hủy theo yêu cầu của bạn.";
  if (message === "Scan failed.") return "Quét ảnh không thành công.";
  if (message === "Unable to create result archive.") return "Không thể tạo tệp kết quả.";
  if (message === "Unsupported format. Use JPG, PNG, or WebP.") return "Định dạng không được hỗ trợ. Vui lòng dùng JPG, PNG hoặc WebP.";
  if (message === "The file is empty or corrupted.") return "Tệp trống hoặc đã bị hỏng.";
  if (message.startsWith("File exceeds ")) return message.replace("File exceeds", "Tệp vượt quá giới hạn");
  if (message.includes("File signature does not match its declared image type.")) {
    return message.replace(
      "File signature does not match its declared image type.",
      "Chữ ký tệp không khớp với định dạng ảnh đã khai báo.",
    );
  }
  if (message.startsWith("Image cannot be decoded.")) return "Không thể đọc ảnh. Tệp có thể bị hỏng hoặc trình duyệt không hỗ trợ.";
  if (message.startsWith("Fixed-logo detector not configured.")) return "Trình dò logo cố định chưa được cấu hình. Hãy bổ sung logo mẫu và bộ dữ liệu đã gắn nhãn.";
  if (message.startsWith("Scanner returned invalid or inconsistent data.")) return "Trình quét trả về dữ liệu không hợp lệ hoặc không nhất quán. Vui lòng quét lại và kiểm tra cấu hình.";
  if (message.startsWith("Download is available only")) return "Chỉ có thể tải xuống sau khi toàn bộ ảnh đã xử lý xong.";
  return message;
}

function decisionLabel(value: ReviewDecision) {
  return value === "accepted" ? "đã chấp nhận" : value === "rejected" ? "đã từ chối" : "xem lại sau";
}

export default function DetectorApp({ scanner = new UnconfiguredLogoScanner() }: { scanner?: LogoScanner }) {
  const [items, setItems] = useState<QueuedImage[]>([]);
  const [active, setActive] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [viewTab, setViewTab] = useState<Record<string, "original" | "cleaned">>({});
  const itemsRef = useRef(items);
  const batchInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.cleanedUrl) URL.revokeObjectURL(item.cleanedUrl);
    });
    controller.current?.abort();
  }, []);

  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (items.length + incoming.length > DEFAULT_LIMITS.maxFiles) {
      setNotice(`Maximum ${DEFAULT_LIMITS.maxFiles} images per batch.`);
      return;
    }
    const existing = new Set(await Promise.all(items.map((item) => fingerprint(item.file))));
    const added: QueuedImage[] = [];
    const errors: string[] = [];
    for (const file of incoming) {
      const validation = await validateImage(file);
      if (validation) { errors.push(`${file.name}: ${validation}`); continue; }
      const identity = await fingerprint(file);
      if (existing.has(identity)) { errors.push(`${file.name}: duplicate skipped.`); continue; }
      existing.add(identity);
      try {
        const dimensions = await decodeImage(file);
        const sourceHash = await sha256(file);
        added.push({ id: uid(), file, url: URL.createObjectURL(file), ...dimensions, sourceHash, status: "queued" });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "Image cannot be decoded."}`);
      }
    }
    setItems((current) => [...current, ...added]);
    setNotice(errors.join(" "));
  }

  async function chooseBatch(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files) await addFiles(event.target.files);
    event.target.value = "";
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      window.localStorage.setItem("markscan-theme", next);
    } catch {
      // The selected theme still applies for this session when storage is blocked.
    }
  }

  function remove(id: string) {
    setItems((current) => {
      const found = current.find((item) => item.id === id);
      if (found) {
        URL.revokeObjectURL(found.url);
        if (found.cleanedUrl) URL.revokeObjectURL(found.cleanedUrl);
      }
      return current.filter((item) => item.id !== id);
    });
    if (batchInput.current) batchInput.current.value = "";
  }

  function clear() {
    items.forEach((item) => {
      URL.revokeObjectURL(item.url);
      if (item.cleanedUrl) URL.revokeObjectURL(item.cleanedUrl);
    });
    setItems([]);
    setProgress({});
    setNotice("");
    if (batchInput.current) batchInput.current.value = "";
  }

  async function scan() {
    if (active || !items.length) return;
    setActive(true);
    setCancelling(false);
    setNotice("");
    const abort = new AbortController();
    controller.current = abort;
    const targets = [...items];
    setItems((current) => current.map((item) => ({ ...item, status: "scanning", scan: undefined, mask: undefined, decision: undefined, error: undefined })));
    try {
      for (const target of targets) {
        if (abort.signal.aborted) break;
        try {
          const output = await runValidatedScan(scanner, {
            itemId: target.id, file: target.file, sourceHash: target.sourceHash,
            width: target.width, height: target.height,
          }, abort.signal, (value) => setProgress((current) => ({ ...current, [target.id]: value })));
          if (abort.signal.aborted) break;
          let cleanedUrl: string | undefined;
          let cleanedFile: File | undefined;
          const box = output.mask?.bounds ?? output.result.boundingBox;
          if (output.result.status === "review" && box) {
            try {
              const inpainted = await inpaintImage(target.file, box);
              cleanedUrl = inpainted.cleanedUrl;
              cleanedFile = inpainted.cleanedFile;
            } catch (error) { console.error("Inpainting failed:", error); }
          }
          setItems((current) => current.map((item) => item.id === target.id ? {
            ...item, status: output.result.status, scan: output.result, mask: output.mask,
            decision: undefined, error: output.result.error?.message, cleanedUrl, cleanedFile,
          } : item));
          setProgress((current) => ({ ...current, [target.id]: 1 }));
        } catch (error) {
          const cancelled = abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
          const message = cancelled ? "Cancelled by user." : error instanceof Error ? error.message : "Scan failed.";
          setItems((current) => current.map((item) => item.id === target.id ? {
            ...item, status: cancelled ? "cancelled" : "error", scan: undefined,
            mask: undefined, decision: undefined, error: message,
          } : item));
          if (cancelled) break;
        }
      }
    } finally {
      if (abort.signal.aborted) {
        setItems((current) => current.map((item) => item.status === "scanning" || item.status === "cancelling" ? {
          ...item, status: "cancelled", scan: undefined, mask: undefined,
          decision: undefined, error: "Cancelled by user.",
        } : item));
      }
      controller.current = null;
      setCancelling(false);
      setActive(false);
    }
  }

  function cancel() {
    if (!controller.current || cancelling) return;
    setCancelling(true);
    setItems((current) => current.map((item) => item.status === "scanning" ? { ...item, status: "cancelling", scan: undefined, mask: undefined, decision: undefined } : item));
    controller.current.abort();
  }

  function review(item: QueuedImage, value: ReviewDecision) {
    const decision = decide(item, value);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, decision } : entry));
  }

  async function download() {
    try {
      const blob = await createArchive(items);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "markscan-results.zip";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create result archive."); }
  }

  const complete = items.length > 0 && items.every((item) => isTerminalWorkflowStatus(item.status));
  const counts = useMemo(() => Object.fromEntries((["queued", "scanning", "review", "not-found", "error", "cancelled"] as WorkflowStatus[])
    .map((status) => [status, items.filter((item) => item.status === status).length])), [items]);
  const total = items.reduce((sum, item) => sum + (progress[item.id] ?? (isTerminalWorkflowStatus(item.status) ? 1 : 0)), 0) / (items.length || 1);
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const completedCount = items.filter((item) => isTerminalWorkflowStatus(item.status)).length;

  return (
    <main className="app-shell">
      <input ref={batchInput} id="batch-input" type="file" multiple disabled={active}
        accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseBatch(event)} />

      <header className="topbar">
        <span className="wordmark">MarkScan</span>
        <div className="topbar-actions">
          <span className="local-pill"><span aria-hidden="true">▣</span> Xử lý cục bộ <i>·</i> Không tải lên</span>
          <button className="icon-button theme-toggle" type="button" aria-label={theme === "light" ? "Chuyển sang giao diện tối" : "Chuyển sang giao diện sáng"} aria-pressed={theme === "dark"} title={theme === "light" ? "Giao diện tối" : "Giao diện sáng"} onClick={toggleTheme}>
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Cài đặt" title="Cài đặt">⚙</button>
        </div>
      </header>

      <section className="content-canvas">
        {notice && <div id="app-notice" role="alert" className="notice">{localizeMessage(notice)}<LegacyText>{notice}</LegacyText></div>}

        {!items.length && (
          <div className="empty-state">
            <div id="upload-zone" role="button" tabIndex={0} aria-disabled={active}
              className={`drop-zone ${drag ? "drag" : ""}`}
              onDragOver={(event) => { event.preventDefault(); if (!active) setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => { event.preventDefault(); setDrag(false); if (!active) void addFiles(event.dataTransfer.files); }}
              onKeyDown={(event) => { if (!active && (event.key === "Enter" || event.key === " ")) batchInput.current?.click(); }}>
              <span className="upload-glyph" aria-hidden="true">⇧</span>
              <h1>Kéo thả ảnh vào đây để bắt đầu</h1>
              <p>JPG, PNG hoặc WebP · Tối đa 50 ảnh · 25 MB mỗi ảnh</p>
              <label className="button primary" htmlFor="batch-input">Chọn ảnh</label>
            </div>
            <p className="privacy-note"><span aria-hidden="true">♢</span> Tệp không bao giờ rời khỏi trình duyệt của bạn</p>
          </div>
        )}

        {!!items.length && !complete && (
          <>
            {active && (
              <section className="processing-intro">
                <span className="secure-kicker">▣ Ảnh của bạn không bao giờ rời khỏi thiết bị này</span>
                <h1>Đang xử lý ảnh</h1>
                <p>Đang quét và khôi phục ảnh ngay trên thiết bị</p>
                <div className="progress-panel">
                  <span>Tiến độ tổng thể</span>
                  <div className="progress-copy"><strong>{Math.round(total * 100)}%</strong> Đã hoàn tất {completedCount}/{items.length} ảnh</div>
                  <div className="progress-track"><i style={{ width: `${total * 100}%` }} /></div>
                </div>
              </section>
            )}

            <div className="queue-heading">
              <div><h1>{active ? "Hàng đợi xử lý" : "Danh sách ảnh"}</h1><span className="ready-copy">{items.length} ảnh sẵn sàng<LegacyText>{`${items.length} image${items.length === 1 ? "" : "s"} ready`}</LegacyText></span></div>
              <span>{items.length}/50 · {(totalBytes / 1048576).toFixed(1)} MB</span>
            </div>
            <div className="queue-table" role="table" aria-label="Danh sách ảnh chờ xử lý">
              <div className="queue-row queue-labels" role="row">
                <span>Trạng thái</span><span>Tên tệp</span><span>Kích thước</span><span>Dung lượng</span><span>Chi tiết</span><span />
              </div>
              {items.map((item) => (
                <div className={`queue-row ${item.status === "scanning" || item.status === "cancelling" ? "current" : ""}`} role="row" key={item.id}>
                  <span className={`status-dot ${item.status}`} aria-label={statusLabel[item.status]}>{isTerminalWorkflowStatus(item.status) ? "✓" : item.status === "queued" ? "○" : "◔"}</span>
                  <span className="file-cell"><img src={item.url} alt="" /><b>{item.file.name}</b></span>
                  <span>{item.width}×{item.height}</span>
                  <span>{(item.file.size / 1048576).toFixed(1)} MB</span>
                  <span className={`status-text ${item.status}`}>{statusLabel[item.status]}{item.status === "scanning" ? ` ${Math.round((progress[item.id] ?? 0) * 100)}%` : ""}</span>
                  <button className="row-remove" aria-label={`Remove ${item.file.name}`} title={`Xóa ${item.file.name}`} onClick={() => remove(item.id)} disabled={active}>×</button>
                  {(item.status === "scanning" || item.status === "cancelling") && <span className="row-progress"><i style={{ width: `${(progress[item.id] ?? 0) * 100}%` }} /></span>}
                </div>
              ))}
              {!active && <label className="button secondary add-images" htmlFor="batch-input"><b>＋</b> Thêm ảnh</label>}
            </div>

            <div className="action-dock">
              {active ? (
                <button id="cancel-button" className="button danger" onClick={cancel} disabled={cancelling}>{cancelling ? "Đang hủy…" : "Hủy quét"}<LegacyText>{cancelling ? "Cancelling…" : "Cancel scan"}</LegacyText></button>
              ) : (
                <>
                  <button className="button ghost" onClick={clear}>Xóa hàng đợi<LegacyText>Clear queue</LegacyText></button>
                  <button id="scan-button" className="button primary" onClick={() => void scan()}>✣ Quét ảnh và xóa hình mờ<LegacyText>Scan images &amp; remove watermark</LegacyText></button>
                </>
              )}
            </div>
          </>
        )}

        {complete && (
          <section className="results">
            <div className="results-heading">
              <div><span className="secure-kicker">Xử lý hoàn tất</span><h1>Ảnh của bạn đã sẵn sàng</h1><p>Hãy kiểm tra vùng đã khôi phục trước khi tải kết quả xuống.</p></div>
              <button id="download-audit" className="button primary" onClick={() => void download()}>↓ Tải tất cả</button>
            </div>
            <div className="metrics">
              <div><b>{counts.review}</b><span>Hình mờ đã xử lý</span></div>
              <div><b>{counts["not-found"]}</b><span>Không có hình mờ</span></div>
              <div><b>{counts.error}</b><span>Thất bại</span></div>
              <div><b>{items.length}</b><span>Tổng số ảnh</span></div>
            </div>
            <div className="result-grid">
              {items.map((item) => {
                const mode = viewTab[item.id] ?? "original";
                return (
                  <article className="result-card" data-status={item.status} key={item.id}>
                    <div className="preview">
                      <img src={mode === "cleaned" && item.cleanedUrl ? item.cleanedUrl : item.url} alt={`${mode === "cleaned" ? "Ảnh đã xử lý" : "Ảnh gốc"}: ${item.file.name}`} />
                      {mode === "original" && item.mask && <span data-testid="mask-overlay" className="mask-box" style={{ left: `${item.mask.bounds.x / item.mask.bounds.imageWidth * 100}%`, top: `${item.mask.bounds.y / item.mask.bounds.imageHeight * 100}%`, width: `${item.mask.bounds.width / item.mask.bounds.imageWidth * 100}%`, height: `${item.mask.bounds.height / item.mask.bounds.imageHeight * 100}%` }} />}
                      <span className={`result-badge ${item.status}`}>{statusLabel[item.status]}</span>
                    </div>
                    <div className="result-body">
                      <div className="result-title"><b>{item.file.name}</b><button aria-label={`Remove ${item.file.name}`} title={`Xóa ${item.file.name}`} onClick={() => remove(item.id)}>×</button></div>
                      <small>{item.width}×{item.height} · {(item.file.size / 1048576).toFixed(2)} MB</small>
                      {item.cleanedUrl && <div className="preview-toggle" data-testid="preview-toggle"><button className={mode === "original" ? "active" : ""} onClick={() => setViewTab((current) => ({ ...current, [item.id]: "original" }))}>Ảnh gốc</button><button className={mode === "cleaned" ? "active" : ""} onClick={() => setViewTab((current) => ({ ...current, [item.id]: "cleaned" }))}>Đã xử lý</button></div>}
                      {item.scan?.confidence !== undefined && <div className="score"><span>Độ tin cậy <b>{Math.round(item.scan.confidence * 100)}%</b><LegacyText>{`Confidence ${Math.round(item.scan.confidence * 100)}%`}</LegacyText></span><span>{item.scan.processingTimeMs} ms</span></div>}
                      {item.error && <p className="review">{localizeMessage(item.error)}<LegacyText>{item.error}</LegacyText></p>}
                      {item.mask && item.status === "review" && <div className="review-actions"><button onClick={() => review(item, "accepted")}>Chấp nhận vùng chọn<LegacyText>Accept mask</LegacyText></button><button onClick={() => review(item, "rejected")}>Từ chối vùng chọn<LegacyText>Reject mask</LegacyText></button><button onClick={() => review(item, "deferred")}>Xem lại sau<LegacyText>Defer review</LegacyText></button></div>}
                      {item.decision && <p className="decision">Quyết định: <b>{decisionLabel(item.decision.decision)}</b><LegacyText>{item.decision.decision}</LegacyText></p>}
                      {item.cleanedFile && item.cleanedUrl && <button className="download-cleaned" onClick={() => { if (!item.cleanedUrl) return; const anchor = document.createElement("a"); anchor.href = item.cleanedUrl; anchor.download = item.cleanedFile?.name ?? "anh-da-xu-ly"; anchor.click(); }}>↓ Tải ảnh đã xử lý</button>}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="new-batch"><button className="button secondary" onClick={clear}>Bắt đầu lượt mới</button></div>
          </section>
        )}
      </section>
    </main>
  );
}
