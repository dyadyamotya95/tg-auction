try {
  rs.status()
  print('Replica set already initialized')
} catch (e) {
  rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo'}]})
  print('Replica set initialized')
}
