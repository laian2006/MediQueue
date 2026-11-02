const statuses = {
  WAITING: { label: 'Đang chờ', message: 'Vui lòng theo dõi số và chờ được gọi đến quầy.' },
  CALLED: { label: 'Đã được gọi', message: 'Vui lòng đến quầy đăng ký để được tiếp nhận.' },
  REGISTERING: { label: 'Đang tiếp nhận', message: 'Nhân viên đang thực hiện thủ tục đăng ký.' },
  COMPLETED: { label: 'Đã hoàn tất đăng ký', message: 'Thủ tục đăng ký tại quầy đã hoàn tất.' },
  CANCELLED: { label: 'Đã hủy', message: 'Phiếu này đã kết thúc và không còn trong hàng chờ.' },
  NO_SHOW: { label: 'Đã ghi nhận vắng', message: 'Nhân viên đã ghi nhận vắng mặt cho phiếu này.' },
};

export default function TicketCard({ patient, ticketView }) {
  const { ticket, waitingAhead } = ticketView;
  const status = statuses[ticket.status] ?? { label: 'Chưa xác định', message: 'Chưa có thông tin trạng thái phù hợp.' };

  return (
    <div className="patient-ticket">
      <p className="patient-kicker">Số thứ tự của bạn</p>
      <p className="patient-ticket-number" aria-label={`Số thứ tự ${ticket.number}`}>{ticket.number}</p>
      <p className={`patient-status patient-status--${ticket.status.toLowerCase()}`}>{status.label}</p>
      <p className="patient-ticket-message">{status.message}</p>
      <dl className="patient-ticket-details">
        <div><dt>Hồ sơ</dt><dd>{patient.displayName}</dd></div>
        <div><dt>Mã hồ sơ</dt><dd>{patient.code}</dd></div>
        {ticket.status === 'WAITING' && waitingAhead !== null && (
          <div><dt>Số người đang chờ phía trước</dt><dd>{waitingAhead}</dd></div>
        )}
      </dl>
      {ticket.status === 'WAITING' && waitingAhead === 0 && (
        <p className="patient-hint">Không còn phiếu đang chờ phía trước. Vui lòng chờ nhân viên gọi.</p>
      )}
    </div>
  );
}
