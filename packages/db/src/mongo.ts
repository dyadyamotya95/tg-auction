import mongoose from 'mongoose'

export { mongoose }

let connectPromise: Promise<typeof mongoose> | null = null

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  if (!uri) {
    throw new Error('MONGO_URI is required')
  }

  if (connectPromise) {
    return connectPromise
  }

  connectPromise = mongoose.connect(uri, { autoIndex: true })

  return connectPromise
}
