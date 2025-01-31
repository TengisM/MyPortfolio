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
};