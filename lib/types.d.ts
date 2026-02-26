export { };

declare global {
    interface Window {
        longdo: any;
    }
}

declare module 'next/link' {
    import Link from 'next/dist/client/link';
    export default Link;
}
