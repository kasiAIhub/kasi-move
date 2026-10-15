import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Home } from 'lucide-react';
import { useStore } from '../store';

export function Navigation() {
  const { session } = useStore();
  const home = {
    customer: '/',
    owner: '/kitchen',
    spaza: '/spaza-owner/packing',
    tavern: '/tavern-owner/packing',
    rider: '/rider',
  }[session.role];
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const index = Number(window.history.state?.idx || 0);
  const maximum = useRef(index);
  const [canForward, setCanForward] = useState(false);
  useEffect(() => {
    maximum.current = navigationType === 'PUSH' ? index : Math.max(maximum.current, index);
    setCanForward(index < maximum.current);
  }, [location.key, navigationType, index]);
  const path = location.pathname;
  const fallback = path.startsWith('/owner/orders/')
    ? '/owner/orders'
    : path.startsWith('/owner')
      ? '/kitchen'
      : ['/kitchen', '/spaza-owner/packing', '/tavern-owner/packing', '/rider'].includes(path)
        ? '/roles'
        : path.startsWith('/spaza-owner')
          ? '/spaza-owner/packing'
          : path.startsWith('/tavern-owner')
            ? '/tavern-owner/packing'
            : path.startsWith('/rider/')
              ? '/rider'
              : path.startsWith('/menu/')
                ? '/menu'
                : path === '/checkout/payment'
                  ? '/checkout/delivery'
                  : path === '/checkout/delivery'
                    ? '/cart'
                    : path.startsWith('/orders/')
                      ? '/orders'
                      : path === '/'
                        ? '/roles'
                        : '/';
  return (
    <nav className="screen-navigation" aria-label="Page navigation">
      <button onClick={() => (index > 0 ? navigate(-1) : navigate(fallback))}>
        <ArrowLeft size={18} /> Back
      </button>
      <Link to={home} aria-label="Go to home">
        <Home size={17} /> Home
      </Link>
      <button disabled={!canForward} onClick={() => navigate(1)}>
        Forward <ArrowRight size={18} />
      </button>
    </nav>
  );
}
