export {};

declare global {
    interface IHeaderItem {
        label: string;
        scrollId: string;
    };

    interface IComment {
        text: string;
        id: string;
        timestamp: number;
    };

    interface IProject {
        text: string;
        url: string,
        title: string;
        logo: StaticImageData;
    };

    interface IExperience {
        duration: string;
        title: string;
        position: string;
        description?: string;
    };

    interface NavItemProps {
        item: typeof headerItems[number];
        index: number;
        isActive: boolean;
    };

    type State = {
        isSuccess: boolean;
        error: string | null;
    };
};