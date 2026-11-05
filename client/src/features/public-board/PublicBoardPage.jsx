import { useEffect, useState } from 'react';
import { pollPublicBoard } from './public-board.polling.js';
import './public-board.css';

const formatNumber = (number) => String(number).padStart(3, '0');

export default function PublicBoardPage() {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => pollPublicBoard({
    onData: (data) => { setBoard(data); setError(false); },
    onError: () => setError(true),
  }), [attempt]);

  return <main className="public-board">
    <div className="public-board__heading"><p>QUẦY ĐĂNG KÝ NGOẠI TRÚ</p><h1>Bảng gọi số</h1></div>
    {error && <div className="public-board__error" role="alert">
      <p>{board ? 'Mất kết nối. Dữ liệu bên dưới có thể đã cũ.' : 'Chưa tải được bảng gọi số. Vui lòng thử lại.'}</p>
      <button onClick={() => setAttempt((n) => n + 1)}>Thử lại</button>
    </div>}
    {!board && !error && <p role="status">Đang tải bảng gọi số…</p>}
    {board && <>
      <section className="public-board__current" aria-labelledby="current-number-title" aria-live="polite" aria-atomic="true">
        <h2 id="current-number-title">{board.currentTicket?.status === 'REGISTERING' ? 'Đang đăng ký tại quầy' : 'Số đang được gọi'}</h2>
        {board.currentTicket
          ? <p className="public-board__number">{formatNumber(board.currentTicket.number)}</p>
          : <p className="public-board__empty">Chưa có số được gọi</p>}
        {board.currentTicket?.status === 'CALLED' && <p>Vui lòng đến quầy đăng ký</p>}
      </section>
      <section className="public-board__waiting" aria-labelledby="waiting-numbers-title">
        <h2 id="waiting-numbers-title">Các số đang chờ <span>({board.waitingNumbers.length})</span></h2>
        {board.waitingNumbers.length
          ? <ol aria-label="Số thứ tự đang chờ">{board.waitingNumbers.map((number) => <li key={number}>{formatNumber(number)}</li>)}</ol>
          : <p>Không có số đang chờ</p>}
      </section>
      <p className="public-board__updated">Cập nhật gần nhất: <time dateTime={board.updatedAt}>{new Date(board.updatedAt).toLocaleTimeString('vi-VN')}</time></p>
    </>}
    <p className="public-board__notice">Vui lòng theo dõi số thứ tự của bạn. Bảng tự cập nhật.</p>
  </main>;
}
