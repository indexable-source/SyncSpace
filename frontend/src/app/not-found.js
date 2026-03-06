import Link from 'next/link';

export default function NotFound() {
    return (
        <div style={{
            height: 'calc(100vh - 100px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            padding: '2rem'
        }}>
            <h1 className="font-serif" style={{ fontSize: '8rem', lineHeight: 1, marginBottom: '1rem', color: 'var(--text-primary)' }}>404.</h1>
            <p className="font-mono text-muted" style={{ fontSize: '1.2rem', marginBottom: '3rem', maxWidth: '400px', lineHeight: 1.5 }}>
                THE PAGE YOU ARE LOOKING FOR DOES NOT EXIST OR HAS BEEN MOVED.
            </p>
            <Link href="/" className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1rem', textDecoration: 'none' }}>
                RETURN TO DASHBOARD
            </Link>
        </div>
    );
}
