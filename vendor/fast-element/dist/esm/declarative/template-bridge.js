/**
 * Coordinates declarative template publishers and FAST element definitions.
 * Requests are keyed by registry + element name so scoped registries can
 * resolve templates independently.
 * @internal
 */
export class DeclarativeTemplateBridge {
    constructor() {
        this.buckets = new WeakMap();
    }
    requestTemplate(definition) {
        return new Promise((resolve, reject) => {
            const bucket = this.getBucket(definition.registry, definition.name, true);
            const request = {
                definition,
                settled: false,
                resolve,
                reject,
            };
            bucket.requests.add(request);
            this.processBucket(definition.registry, definition.name);
        });
    }
    registerPublisher(registry, name, publisher) {
        if (!name) {
            return;
        }
        const bucket = this.getBucket(registry, name, true);
        bucket.publishers.add(publisher);
        this.processBucket(registry, name);
    }
    unregisterPublisher(registry, name, publisher) {
        if (!name) {
            return;
        }
        const bucket = this.getBucket(registry, name);
        if (!bucket) {
            return;
        }
        bucket.publishers.delete(publisher);
        this.resetPublisherRequests(bucket, publisher);
        this.processBucket(registry, name);
        this.cleanupBucket(registry, name, bucket);
    }
    movePublisher(registry, previousName, nextName, publisher) {
        if (previousName === nextName) {
            return;
        }
        this.unregisterPublisher(registry, previousName, publisher);
        this.registerPublisher(registry, nextName, publisher);
    }
    getBucket(registry, name, create = false) {
        let bucketsByName = this.buckets.get(registry);
        if (!bucketsByName) {
            if (!create) {
                return void 0;
            }
            bucketsByName = new Map();
            this.buckets.set(registry, bucketsByName);
        }
        let bucket = bucketsByName.get(name);
        if (!bucket && create) {
            bucket = {
                publishers: new Set(),
                requests: new Set(),
            };
            bucketsByName.set(name, bucket);
        }
        return bucket;
    }
    processBucket(registry, name) {
        const bucket = this.getBucket(registry, name);
        if (!bucket) {
            return;
        }
        // Set iteration preserves insertion order, so duplicate publishers leave
        // the first connected publisher responsible for pending requests.
        const publisher = bucket.publishers.values().next().value;
        if (publisher === undefined) {
            return;
        }
        for (const request of bucket.requests) {
            if (request.settled) {
                continue;
            }
            if (request.publisher === publisher && request.publishing) {
                continue;
            }
            request.publisher = publisher;
            request.publishing = Promise.resolve()
                .then(() => publisher.publishTemplate(request.definition))
                .then(template => {
                if (request.settled) {
                    return;
                }
                const currentBucket = this.getBucket(registry, name);
                if (!(currentBucket === null || currentBucket === void 0 ? void 0 : currentBucket.publishers.has(publisher))) {
                    request.publisher = void 0;
                    request.publishing = void 0;
                    this.processBucket(registry, name);
                    return;
                }
                this.resolveRequest(registry, name, currentBucket, request, template);
            })
                .catch(error => {
                if (request.settled) {
                    return;
                }
                const currentBucket = this.getBucket(registry, name);
                if (!currentBucket) {
                    return;
                }
                this.rejectRequest(registry, name, currentBucket, request, error);
            });
        }
    }
    resetPublisherRequests(bucket, publisher) {
        for (const request of bucket.requests) {
            if (request.publisher !== publisher) {
                continue;
            }
            request.publisher = void 0;
            request.publishing = void 0;
        }
    }
    resolveRequest(registry, name, bucket, request, template) {
        if (request.settled) {
            return;
        }
        request.settled = true;
        request.publisher = void 0;
        request.publishing = void 0;
        bucket.requests.delete(request);
        this.cleanupBucket(registry, name, bucket);
        request.resolve(template);
    }
    rejectRequest(registry, name, bucket, request, error) {
        if (request.settled) {
            return;
        }
        request.settled = true;
        request.publisher = void 0;
        request.publishing = void 0;
        bucket.requests.delete(request);
        this.cleanupBucket(registry, name, bucket);
        request.reject(error);
    }
    cleanupBucket(registry, name, bucket) {
        if (bucket.publishers.size > 0 || bucket.requests.size > 0) {
            return;
        }
        const bucketsByName = this.buckets.get(registry);
        bucketsByName === null || bucketsByName === void 0 ? void 0 : bucketsByName.delete(name);
    }
}
/**
 * Shared template bridge storage for the current FAST runtime.
 * @internal
 */
export const declarativeTemplateBridge = new DeclarativeTemplateBridge();
