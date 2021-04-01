var jwt = require('jsonwebtoken')

const token = jwt.sign({id:'123'}, 'secret', { expiresIn: '10 s' })

// console.log(token)

//根据固定密钥解密token
const decoded = jwt.decode(token, 'secret')
console.log(decoded)