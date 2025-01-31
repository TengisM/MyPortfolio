import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'About',
};

export default function AboutLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <section id='about' className="w-full max-w-screen-xl px-5 my-16 md:my-32">{children}</section>
};
