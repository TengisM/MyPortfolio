'use client'
import * as React from "react";
import Image, { StaticImageData } from "next/image";
import { ShowMore } from "../common";
import { Urlink } from "../../../public/common";
import { Bidend, Lann, Tetgeleg, Ubcab, Ubeats } from "../../../public/projects";

interface IProject {
    text: string;
    url: string,
    title: string;
    more?: string;
    logo: StaticImageData;
};

const projectItems: IProject[] = [
    {
        title: 'Tetgeleg',
        logo: Tetgeleg,
        url: 'https://tetgeleg.mn/',
        text: 'Helps students and organizations connect with each other. Gives everyone equal chance for better education and especially those who are in rural area.',
        more: 'My part was in the back-office and also the web app, where students can read articles with tips for getting into their dream schools. We even set up events for students to meet up and build a community.'
    },
    {
        title: 'Lann',
        logo: Lann,
        url: 'https://lann.mn/',
        text: 'Buy, sell, and trade skins easier and faster. All deals are secured with the highest level protection methods.',
        more: 'Our main goal is to make sure all trades are safe and scam-free. We act as a third-party to oversee the trades, ensuring everything is fair and secure.'
    },
    {
        title: 'Ubcab',
        logo: Ubcab,
        url: 'https://ubcab.mn/',
        text: 'A company plans to provide services in the public transport sector, expand its services to enterprises, and launch an IPO.',
        more: 'The platform will cater to all types of transportation needs throughout Mongolia 24/7. Additional services, such as hand-to-hand delivery, car rental, and designated drivers, are also available.'
    },
    {
        title: 'Ubeats',
        logo: Ubeats,
        url: 'https://ubeats.mn/',
        text: "I worked on an office food delivery service, designed to make life easier for busy office workers.",
        more: "Plus, we've got a DarkStore and Darkkitchen, all unnecessary expenses are reduced, and quality food at competitive, affordable prices can be provided and be promptly delivered to your location. It's all about bringing tasty, convenient lunches right to your desk! The cool part is, it's integrated with our cab system, so delivery is super smooth and reliable."
    },
    {
        title: 'Bidend',
        logo: Bidend,
        url: 'https://bidend.mn/',
        text: 'Intermediary and unnecessary costs will be reduced by offering an open auction platform for trade and asset management, and it will bring increased capital flows and accelerated economic circulation.',
    }
];

const ProjectItem = React.memo(({ project, index }: { project: IProject, index: number }) => (
    <div className={`grid gap-2.5 p-4 bg-neutral-900 overflow-hidden relative border rounded-xl hover:bg-zinc-800/10 group hover:border-zinc-400/50 border-zinc-600 transition duration-500 ${index % 2 === 0 ? 'animate-slideInLeft' : 'animate-slideInRight'}`}>
        <a className="flex gap-1.5 w-fit hover:animate-pulse" href={project.url} aria-label={project.title} target="_blank" rel="noopener noreferrer">
            <Image
                src={Urlink}
                alt='link-logo'
                loading="lazy"
                className="w-3.5"
            />
            <Image
                src={project.logo}
                alt={project.title}
                loading="lazy"
                className="w-auto"
            />
        </a>
        <div className="text-neutral-400 font-medium cursor-default">
            <span className="text-sm md:text-base">{project.text}</span>
            {project.more && <ShowMore text={project.more} />}
        </div>
    </div>
));

ProjectItem.displayName = 'ProjectItem';

const Projects: React.FC = () => {
    const [ isVisible, setIsVisible ] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleScroll = () => {
            if (ref.current && !isVisible) {
                const top = ref.current.getBoundingClientRect().top;
                const isVisibleNow = top <= window.innerHeight - 100;
                if (isVisibleNow) {
                    setIsVisible(true);
                }
            }
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isVisible]);

    return (
        <section id='projects' className="w-full max-w-screen-xl px-5 my-16 md:my-32">
            <div className="md:text-xl text-cyan-400">Projects that I worked</div>
            <div className="w-full h-px bg-zinc-600 my-8 md:my-12" />
            <div ref={ref} className="grid md:grid-cols-2 gap-5">
                {isVisible && projectItems.map((project, index) => (
                    <ProjectItem key={index} project={project} index={index} />
                ))}
            </div>
        </section>
    );
};

export default Projects;
