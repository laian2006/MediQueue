function formatTime(value) {
  return new Date(value).toLocaleTimeString('vi-VN');
}

export default function WaitingList({ tickets }) {
  if (tickets.length === 0) {
    return <p className="staff-empty">Hàng chờ đang trống.</p>;
  }

  return (
    <ol className="staff-queue">
      {tickets.map((ticket) => (
        <li key={ticket.ticketId}>
          <strong aria-label={`Số chờ ${ticket.number}`}>{ticket.number}</strong>
          <span>Lấy số lúc {formatTime(ticket.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}
