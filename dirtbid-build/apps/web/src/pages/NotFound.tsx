import { Link } from 'react-router';
import { useTitle } from '@/lib/useTitle';
export function NotFoundPage() { useTitle('Page not found'); return <div className="container-x py-24 text-center"><p className="mono text-6xl font-bold text-stake">404</p><h1 className="h3 mt-3">That parcel is not on the plat.</h1><p className="mt-2 text-sm text-muted">The page you asked for does not exist.</p><Link to="/" className="btn-primary mt-6">Return home</Link></div>; }
