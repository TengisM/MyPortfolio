import Image from 'next/image';
import { Fb, Github, Linkedin } from '../../../public/socialLogo';

interface ISocialItem {
	logo: string;
    label: string;
    value: string;
};

const socialItems: ISocialItem[] = [
	{ logo: Github, value: 'https://github.com/TengisM', label: 'github' },
    { logo: Linkedin, value: 'https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/', label: 'linkedIn' },
	// { logo: Fb, value: 'https://www.facebook.com/didi.focus/', label: 'fb' }
];

const SocialItem = ({
    value,
	logo,
	label
}: ISocialItem) => (
    <a className='transition-all duration-300 hover:scale-125' href={value} aria-label={label} target="_blank" rel="noopener noreferrer">
		<Image src={logo} alt={label} width={32} height={32} />
    </a>
);

const SocialLinks = () => {
	return (
		<div className='flex gap-4 py-4'>
			{socialItems.map((item, index) => (
				<SocialItem label={item.label} key={index} logo={item.logo} value={item.value}/>
			))}
		</div>
	);
};

export default SocialLinks;
