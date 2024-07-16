'use client';
import Image from "next/image";
import { WhiteLogo } from "../../../public/headerLogo";
import { handleSmoothScroll } from "../util";

interface IHeaderItem {
    label: string;
    scrollId: string;
    callback?: () => void;
};

const headerItems: Omit<IHeaderItem, 'onClick'>[] = [
    { scrollId: 'projects', label: 'projects', },
    { scrollId: 'contact', label: 'contact', },
];

const HeaderItem = ({
    label,
    scrollId,
    callback
}: IHeaderItem) => (
    <a className='relative' onClick={() => handleSmoothScroll({ scrollId, callback })}>
        <h3 className="md:text-xl cursor-pointer font-semibold before:bg-cyan-400/60 before:block before:absolute before:inset-0 before:transition-transform before:duration-300 before:ease-in before:scale-x-0 before:origin-bottom-right before:hover:scale-x-100 before:hover:origin-bottom-left">
            {label}
        </h3>
    </a>
);

export default function Header() {
    const handleLogoClick = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    };

    const renderHeaderItems = (cb?: () => void): React.ReactNode => {
        return headerItems.map((item, index) => (
            <HeaderItem label={item.label} key={index} scrollId={item.scrollId} callback={cb} />
        ))
    };

	return (
        <header className="w-full top-0 fixed backdrop-blur-lg shadow-lg z-[100] bg-neutral-700/30">
            <nav className="max-w-screen-xl w-full mx-auto flex justify-between items-center p-4">
                <Image
                    className="rounded-lg content-center mr-5 w-8 md:w-12 cursor-pointer bg-white backdrop-blur-sm"
                    onClick={handleLogoClick}
                    src={WhiteLogo}
                    alt="logo"
                    priority
                />
                <div className="flex gap-6">
                    {renderHeaderItems()}
                </div>
            </nav>
        </header>
	);
};
