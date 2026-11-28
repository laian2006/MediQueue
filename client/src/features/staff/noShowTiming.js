// 2.17: thời gian còn lại đến khi được ghi vắng, tính theo đồng hồ máy chủ chứ không theo máy nhân viên.
// serverOffsetMs = serverTime (từ GET /queue/current) trừ Date.now() lúc nhận phản hồi.
// Chỉ dùng để hiển thị và khóa nút; máy chủ vẫn kiểm tra lại T khi nhận yêu cầu ghi vắng.
export function noShowRemainingSeconds(snapshot, nowMs) {
  const ticket = snapshot?.current;
  if (ticket?.status !== 'CALLED' || !ticket.lastCalledAt) return null;
  const timeout = snapshot.noShowTimeoutSeconds;
  const calledAt = Date.parse(ticket.lastCalledAt);
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(calledAt)) return null;
  const serverNow = nowMs + (Number.isFinite(snapshot.serverOffsetMs) ? snapshot.serverOffsetMs : 0);
  return Math.max(0, Math.ceil((calledAt + timeout * 1000 - serverNow) / 1000));
}

export function serverOffsetMs(serverTime, receivedAtMs) {
  const parsed = Date.parse(serverTime);
  return Number.isFinite(parsed) ? parsed - receivedAtMs : 0;
}
