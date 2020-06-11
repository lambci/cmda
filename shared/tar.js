// @ts-check

const path = require('path')
const { Pack } = require('tar')

/**
 * @returns {string}
 */
exports.randomTgzName = function () {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}.tgz`
}

/**
 * A tar stream with the base stripped from all files passed in
 *
 * @param {import('tar').CreateOptions} options
 * @param {string[]} files
 * @returns {import('tar').PackStream}
 */
exports.strippedTarStream = function (options, files) {
  // @ts-ignore: types are incorrect for node-tar
  const stream = new Pack(options)
  for (const file of files) {
    const absolutePath = path.resolve(file)
    stream.cwd = path.dirname(absolutePath)
    stream.add(path.basename(absolutePath))
  }
  stream.end()
  return stream
}

/**
 * @param {import('stream').Readable} src
 * @param {import('stream').Writable} dest
 * @returns {Promise<void>}
 */
exports.pipePromise = function (src, dest) {
  return new Promise((resolve, reject) => {
    src.on('error', reject)
    dest.on('error', reject)
    src.pipe(dest).on('finish', resolve)
  })
}
