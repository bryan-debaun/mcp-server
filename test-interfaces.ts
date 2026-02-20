import { Book } from './src/http/controllers/BooksController.js'
import { Movie } from './src/http/controllers/MoviesController.js'
import { VideoGame } from './src/http/controllers/VideoGamesController.js'

const book: Book = {
    id: 1,
    title: 'Test',
    status: 'Active',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    rating: 5,
    review: 'Great book',
    ratedAt: '2024-01-01'
}

const movie: Movie = {
    id: 1,
    title: 'Test Movie',
    status: 'Active',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    rating: 4,
    review: 'Good movie',
    ratedAt: '2024-01-01'
}

console.log('Interfaces compiled successfully')
console.log('Book has rating:', 'rating' in book)
console.log('Movie has rating:', 'rating' in movie)