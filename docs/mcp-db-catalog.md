# MCP Database Tools - Book Catalog

This document describes the MCP tools for managing a book catalog database with authors, books, and ratings.

## Database Schema

### Models

- **Author**: Writers with name, bio, and website
- **Book**: Books with title, description, ISBN, and publication date
- **BookAuthor**: Join table for many-to-many relationship between books and authors
- **Rating**: User ratings (1-10) with optional review text

### Relationships

- Books can have multiple authors
- Authors can have multiple books  
- Users can rate books (one rating per user per book)
- Ratings, books, and authors track who created them

## Book Tools

### `list-books`

List books with optional filtering and pagination.

**Parameters:**

- `limit` (number, optional): Maximum number of results (default: 50)
- `offset` (number, optional): Number of results to skip for pagination
- `search` (string, optional): Search in title, description, ISBN
- `authorId` (number, optional): Filter by author ID
- `minRating` (number, optional): Minimum average rating (1-10)

**Returns:**

```json
{
  "books": [
    {
      "id": 1,
      "title": "The Way of Kings",
      "description": "Epic fantasy novel...",
      "isbn": "978-0765326355",
      "publishedAt": "2010-08-31",
      "averageRating": 9.5,
      "ratingCount": 2,
      "authors": [
        {
          "id": 1,
          "name": "Brandon Sanderson"
        }
      ],
      "createdAt": "2026-02-01T...",
      "createdBy": 1
    }
  ],
  "total": 3
}
```

**Example Usage (Copilot Chat):**

- "List all books"
- "Show me books by Brandon Sanderson"
- "Find books with rating above 8"
- "Search for books about 'fantasy'"

### `get-book`

Get detailed information about a specific book including authors and ratings.

**Parameters:**

- `id` (number, required): Book ID

**Returns:**

```json
{
  "id": 1,
  "title": "The Way of Kings",
  "description": "Epic fantasy novel...",
  "isbn": "978-0765326355",
  "publishedAt": "2010-08-31",
  "authors": [
    {
      "id": 1,
      "name": "Brandon Sanderson",
      "bio": "American fantasy writer...",
      "website": "https://brandonsanderson.com"
    }
  ],
  "ratings": [
    {
      "id": 1,
      "rating": 10,
      "review": "Amazing book!",
      "userId": 1,
      "createdAt": "2026-02-01T..."
    }
  ],
  "averageRating": 9.5,
  "totalRatings": 2,
  "createdAt": "2026-02-01T...",
  "createdBy": 1
}
```

**Example Usage:**

- "Show me details for book #1"
- "What are the ratings for The Way of Kings?"

### `create-book` (Admin Only)

Create a new book in the catalog.

**Parameters:**

- `title` (string, required): Book title
- `description` (string, optional): Book description
- `isbn` (string, optional): ISBN number
- `publishedAt` (string, optional): Publication date (ISO 8601 format)
- `authorIds` (array of numbers, optional): Author IDs to link to this book
- `createdBy` (number, optional): User ID of creator

**Returns:**

```json
{
  "id": 4,
  "title": "New Book",
  "description": "A great book",
  "isbn": "978-1234567890",
  "publishedAt": "2024-01-01",
  "authors": [...],
  "createdAt": "2026-02-01T...",
  "createdBy": 1
}
```

**Example Usage:**

- "Create a book titled 'New Book' by author #1"

### `update-book` (Admin Only)

Update an existing book's details.

**Parameters:**

- `id` (number, required): Book ID
- `title` (string, optional): New title
- `description` (string, optional): New description
- `isbn` (string, optional): New ISBN
- `publishedAt` (string, optional): New publication date
- `authorIds` (array of numbers, optional): New list of author IDs (replaces existing)

**Returns:** Updated book object (same format as `get-book`)

**Example Usage:**

- "Update book #1 to add a new description"
- "Change the authors for book #2 to include author #3"

### `delete-book` (Admin Only)

Delete a book from the catalog. Also removes all associated BookAuthor relationships and ratings (cascade delete).

**Parameters:**

- `id` (number, required): Book ID to delete

**Returns:**

```json
{
  "success": true,
  "message": "Book deleted successfully"
}
```

**Example Usage:**

- "Delete book #4"

## Author Tools

### `list-authors`

List authors with optional search and pagination.

**Parameters:**

- `limit` (number, optional): Maximum number of results (default: 50)
- `offset` (number, optional): Number of results to skip
- `search` (string, optional): Search in name, bio

**Returns:**

```json
{
  "authors": [
    {
      "id": 1,
      "name": "Brandon Sanderson",
      "bio": "American fantasy writer...",
      "website": "https://brandonsanderson.com",
      "bookCount": 2,
      "createdAt": "2026-02-01T...",
      "createdBy": 1
    }
  ],
  "total": 2
}
```

### `get-author`

Get detailed author information including all their books.

**Parameters:**

- `id` (number, required): Author ID

**Returns:**

```json
{
  "id": 1,
  "name": "Brandon Sanderson",
  "bio": "American fantasy writer...",
  "website": "https://brandonsanderson.com",
  "books": [
    {
      "id": 1,
      "title": "The Way of Kings",
      "publishedAt": "2010-08-31",
      "averageRating": 9.5
    }
  ],
  "createdAt": "2026-02-01T...",
  "createdBy": 1
}
```

### `create-author` (Admin Only)

Create a new author.

**Parameters:**

- `name` (string, required): Author name
- `bio` (string, optional): Biography
- `website` (string, optional): Website URL
- `createdBy` (number, optional): User ID of creator

### `update-author` (Admin Only)

Update author details.

**Parameters:**

- `id` (number, required): Author ID
- `name` (string, optional): New name
- `bio` (string, optional): New bio
- `website` (string, optional): New website

### `delete-author` (Admin Only)

Delete an author. Also removes all BookAuthor relationships (books remain, just unlinked).

**Parameters:**

- `id` (number, required): Author ID

## Rating Tools

### `list-ratings`

List ratings with optional filtering.

---

## Movie Tools

### `list-movies`

List movies with optional filtering and pagination.

**Parameters:**

- `limit` (number, optional): Maximum number of results (default: 50)
- `offset` (number, optional): Number of results to skip for pagination
- `search` (string, optional): Search in title and description
- `minRating` (number, optional): Minimum average rating (1-10)
- `status` (string, optional): Filter by status

**Returns:**

```json
{ "movies": [ /* movie objects */ ], "total": 10 }
```

### `get-movie`

Get detailed information about a specific movie.

**Parameters:**

- `id` (number, required): Movie ID

### `create-movie` (Admin Only)

Create a new movie (IASN, IMDB ID supported).

**Parameters:**

- `title` (string, required)
- `description` (string, optional)
- `iasn` (string, optional, unique)
- `imdbId` (string, optional, unique)
- `releasedAt` (string, optional)
- `createdBy` (number, optional)

### `update-movie` (Admin Only)

Update an existing movie's details.

### `delete-movie` (Admin Only)

Delete a movie (admin only).

---

## VideoGame Tools

### `list-videogames`

List video games with optional filters (platform, search).

**Parameters:**

- `platform` (string, optional): Filter by `PlayStation`, `Xbox`, `PC`
- `search` (string, optional)
- `limit`, `offset` (pagination)

### `get-videogame`, `create-videogame`, `update-videogame`, `delete-videogame`

CRUD tools for video games. `create-videogame` requires `platform` (PlayStation|Xbox|PC) and supports `igdbId`.

---

## Content Creator Tools

### `list-content-creators`

List content creators with optional search and pagination.

### `get-content-creator`, `create-content-creator`, `update-content-creator`, `delete-content-creator`

CRUD tools for `ContentCreator` including `description` and `website` fields.

**Parameters:**

- `limit` (number, optional): Maximum results (default: 50)
- `offset` (number, optional): Pagination offset
- `bookId` (number, optional): Filter by book
- `userId` (number, optional): Filter by user

**Returns:**

```json
{
  "ratings": [
    {
      "id": 1,
      "rating": 10,
      "review": "Amazing book!",
      "bookId": 1,
      "bookTitle": "The Way of Kings",
      "userId": 1,
      "createdAt": "2026-02-01T..."
    }
  ],
  "total": 2
}
```

### `create-or-update-rating` (Authenticated Users)

Create a new rating or update an existing one for a book. Users can only have one rating per book (upsert).

**Parameters:**

- `bookId` (number, required): Book to rate
- `rating` (number, required): Rating value (1-10)
- `review` (string, optional): Review text
- `userId` (number, required): User creating the rating

**Returns:** Created/updated rating object

**Validation:**

- Rating must be between 1 and 10
- One rating per user per book

### `delete-rating` (Owner or Admin)

Delete a rating. Users can only delete their own ratings unless they're an admin.

**Parameters:**

- `id` (number, required): Rating ID

## Access Control

- **Public Read**: List and get operations for books, authors, and ratings
- **Authenticated Write**: Create/update/delete ratings (users can only modify their own)
- **Admin**: Full CRUD on books and authors, can delete any rating

## Error Handling

All tools gracefully handle database errors:

- List tools return empty arrays if database is unavailable
- Get-by-ID tools return 404 if database is unavailable or record not found
- Create/update/delete tools return clear error messages for validation failures

## Database Seeding

The seed script creates initial data:

- Admin user (<brn.dbn@gmail.com>)
- 2 authors (Brandon Sanderson, Patrick Rothfuss)
- 3 books (The Way of Kings, The Name of the Wind, Mistborn: The Final Empire)
- 2 sample ratings

Run: `npm run prisma:seed`
