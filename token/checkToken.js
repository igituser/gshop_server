const jwt = require('jsonwebtoken')

module.exports = function(req, res, next){
	//如果没有auhorization 请求头，直接返回401响应
	const token = req.headers['authorization']
	if(!token){
		res.status(401)
		return res.json({ message: '无token, 请重新登录'})
	}

	//解构token，生成一个对象{ id: xx, iat: xx, exp: xx}
	let decoded  = jwt.decode(token, 'secret')
	//如果token已过了有效期，返回401响应
	if(!decoded || decoded.exp <= Date.now() / 1000){
		res.status(401)
		return res.json({ message: 'token过期,请重新登录' })
	}

	//通过了token验证，放行
	next();
}