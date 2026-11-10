import { Link } from 'react-router-dom';
import AppRoutes from './routes.jsx';

export default function App() {
  return <>
    <header className="app-header"><Link to="/">MediQueue</Link><span>Đăng ký ngoại trú</span></header>
    <AppRoutes />
  </>;
}
