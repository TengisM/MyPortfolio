import { memo } from "react";
import Image, { StaticImageData } from "next/image";
import { ShowMore } from "../common";
import { Bidend, Lann, Tetgeleg, Ubcab, Ubeats } from "../../../public/projects";

interface IProject {
    text: string;
    url: string,
    more?: string;
    title: string;
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

const ProjectItem = memo(({ project }: { project: IProject }) => (
    <div className="grid gap-2.5 p-4 bg-neutral-900 rounded-2xl">
        <a className="hover:animate-pulse" href={project.url} aria-label={project.title} target="_blank" rel="noopener noreferrer">
            <Image
                src={project.logo}
                alt={project.title}
            />
        </a>
        <div className="text-neutral-400 font-medium cursor-default">
            <span className="text-sm md:text-base">{project.text}</span>
            {project.more && <ShowMore text={project.more} />}
        </div>
    </div>
));

export default function Projects() {
    return (
        <section id='projects' className="w-full max-w-screen-xl p-5">
            <div className="md:text-2xl text-cyan-400 mb-8 md:mb-14">Projects that I worked</div>
            <div className="grid md:grid-cols-2 gap-5">
                { projectItems.map((project, index) => (
                    <ProjectItem key={index} project={project} />
                ))}
            </div>
        </section>
    );
};
