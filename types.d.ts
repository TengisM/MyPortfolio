export {};

declare global {
    interface IComment {
        text: string;
        id: string;
        timestamp: number;
    }
};