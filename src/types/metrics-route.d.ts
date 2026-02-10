declare module '../../http/metrics-route' {
    import type { Counter, Gauge } from 'prom-client';

    // Minimal typings used by our dynamic imports in ratings write paths
    export const bookAggregateUpdateFailuresTotal: Counter<any>;
    export const bookAggregatesLastBackfillTimestamp: Gauge<any>;
}

declare module '../../http/metrics-route.js' {
    import type { Counter, Gauge } from 'prom-client';
    export const bookAggregateUpdateFailuresTotal: Counter<any>;
    export const bookAggregatesLastBackfillTimestamp: Gauge<any>;
}

declare module 'src/http/metrics-route' {
    import type { Counter, Gauge } from 'prom-client';
    export const bookAggregateUpdateFailuresTotal: Counter<any>;
    export const bookAggregatesLastBackfillTimestamp: Gauge<any>;
}

// Fallback wildcard in case module resolution uses a different base path
declare module '*metrics-route' {
    const whatever: any;
    export default whatever;
}
