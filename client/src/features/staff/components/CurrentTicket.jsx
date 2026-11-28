const statuses = {
  CALLED: { label: 'Đang gọi', message: 'Đã gọi số này, chờ người bệnh đến quầy.' },
  REGISTERING: { label: 'Đang tiếp nhận', message: 'Đang làm thủ tục đăng ký tại quầy.' },
};

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('vi-VN') : 'Chưa có';
}

// 2.17: thời gian T do máy chủ cấp; remaining là số giây còn lại tính theo đồng hồ máy chủ.
function noShowText(remaining, timeout) {
  if (remaining === null || remaining === undefined) return 'Chưa có thông tin từ máy chủ';
  if (remaining > 0) return `Còn ${remaining} giây (T = ${timeout} giây)`;
  return `Đã đủ ${timeout} giây, có thể ghi vắng`;
}

export default function CurrentTicket({ ticket, noShowRemaining = null, noShowTimeoutSeconds = null }) {
  if (!ticket) {
    return <p className="staff-empty">Chưa có lượt nào đang được gọi.</p>;
  }

  const status = statuses[ticket.status] ?? { label: 'Chưa xác định', message: 'Chưa có thông tin trạng thái phù hợp.' };

  return (
    <div className="staff-ticket">
      <p className="staff-ticket-number" aria-label={`Số đang xử lý ${ticket.number}`}>{ticket.number}</p>
      <p className={`staff-status staff-status--${ticket.status.toLowerCase()}`}>{status.label}</p>
      <p className="staff-ticket-message">{status.message}</p>
      <dl className="staff-ticket-details">
        <div><dt>Gọi gần nhất</dt><dd>{formatTime(ticket.lastCalledAt)}</dd></div>
        {ticket.status === 'CALLED' && (
          <div><dt>Ghi vắng</dt><dd className="staff-no-show" aria-live="off">{noShowText(noShowRemaining, noShowTimeoutSeconds)}</dd></div>
        )}
      </dl>
    </div>
  );
}
