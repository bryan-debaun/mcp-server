// Remove basics.privateContact (email/phone) from a résumé document for public
// reads. This app-layer stripping is the guarantee ADR-0007 relies on: a public
// response must never carry the private contact fields (#147).

/** Return a deep copy of the document with `basics.privateContact` removed. */
export function stripPrivateContact(document: unknown): unknown {
    // Deep clone so we never mutate the stored row; the document is plain JSON.
    const clone =
        typeof document === 'object' && document !== null
            ? JSON.parse(JSON.stringify(document))
            : document
    if (
        clone &&
        typeof clone === 'object' &&
        clone.basics &&
        typeof clone.basics === 'object'
    ) {
        delete clone.basics.privateContact
    }
    return clone
}
