'use client'
import * as React from 'react';
import Image from 'next/image';
import { Fb, Github, Linkedin } from '../../../public/socialLogo';

interface ISocialItem {
	logo: any;
    label: string;
    value: string;
};

const socialItems: ISocialItem[] = [
	{ logo: Github, value: 'https://github.com/TengisM', label: 'github' },
    { logo: Linkedin, value: 'https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/', label: 'linkedIn' },
	{ logo: Fb, value: 'https://www.facebook.com/didi.focus/', label: 'fb' }
];

const SocialItem = ({
    value,
	logo,
	label
}: ISocialItem) => (
    <a className='transition-all duration-500 hover:scale-125' href={value} aria-label={label} target="_blank" rel="noopener noreferrer">
		<Image src={logo} alt={label} width={32} height={32} />
    </a>
);

const ScrollPop = () => {
	const [ visible, setVisible ] = React.useState(false);

	const handleScroll = () => {
		const scrollPosition = window.scrollY;
		if (scrollPosition > 240) {
			setVisible(true);
		} else {
			setVisible(false);
		}
	};

	React.useEffect(() => {
		window.addEventListener('scroll', handleScroll);
		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	}, []);

	return (
		<div className={`fixed bottom-1/2 right-3 xl:right-14 flex flex-col gap-4 p-1 backdrop-blur-lg bg-neutral-500/30 rounded-3xl transition-opacity duration-500 ease-in-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
			{socialItems.map((item, index) => (
				<SocialItem label={item.label} key={index} logo={item.logo} value={item.value}/>
			))}
		</div>
	);
};

export default ScrollPop;
