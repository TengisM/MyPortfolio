import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Projects',
};

export default function ProjectsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <section id='projects' className="w-full max-w-screen-xl px-5 my-16 md:my-32">{children}</section>
};
