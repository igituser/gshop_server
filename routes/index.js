var express = require('express');
var router = express.Router();
const md5 = require('blueimp-md5')
const models = require('../db/models')
const UserModel = models.getModel('user')
const _filter = {'pwd': 0, '__v': 0} // 查询时过滤掉
const sms_util = require('../util/sms_util')
const users = {}
const ajax = require('../api/ajax')
var svgCaptcha = require('svg-captcha')

const jwt = require('jsonwebtoken')
const checkToken = require('../token/checkToken')
const createToken = require('../token/createToken')

/*
  自动登录
*/

router.get('/auto_login',(req, res, next)=>{
  //得到请求头中的token
  const token = req.headers['authorization']

  //如果请求头中没有token，直接返回
  if(!token){
    return res.send({code: 1, msg: '请先登录'})
  }

  //解码token，如果失败或者过了有效期，返回401
  const decoded = jwt.decode(token, 'secret')
  if(!decoded || decoded.exp < Date.now() / 1000){
    res.status(401)
    return res.json({message: 'token过期'})
  }

  //根据解码出的用户id查询mongodb数据得到对应的user信息返回
  const userId = decoded.id
  UserModel.findOne({_id: userId}, _filter).then( user => {
    res.send({code: 0 , data: user})
  })
})

/*
密码登陆
 */
router.post('/login_pwd', function (req, res) {
  const name = req.body.name
  const pwd = md5(req.body.pwd)
  const captcha = req.body.captcha.toLowerCase()
  // console.log('/login_pwd', name, pwd, captcha, req.session)

  // 可以对用户名/密码格式进行检查, 如果非法, 返回提示信息
  if(captcha!==req.session.captcha) {
    return res.send({code: 1, msg: '验证码不正确'})
  }
  // 删除保存的验证码
  delete req.session.captcha

  UserModel.findOne({name})
    .then((user)=>{
      if(user){
        // console.log(user.pwd, pwd);
        if(user.pwd !== pwd){
          res.send({code:1, msg: '用户名或者密码错误'})
        }else{
          res.send({
            code: 0,
            data:{
              _id : user.id,
              name: user.name,
              phone: user.phone,
              token: createToken(user._id)
            }
          })
        }

        return new Promise(()=>{

        }) //返回一个pending状态的promise对象
      }else{
        return UserModel.create({name, pwd,})
      }
    })

  // UserModel.findOne({name}, function (err, user) {
  //   if (user) {
  //     console.log('findUser', user.name)
  //     if (user.pwd !== pwd) {
  //       res.send({code: 1, msg: '用户名或密码不正确!'})
  //     } else {
  //       req.session.userid = user._id
  //       res.send({
  //         code: 0, 
  //         data: {
  //           _id: user._id, 
  //           name: user.name, 
  //           phone: user.phone,
  //           token: createToken(user._id), //增加token返回
  //         }})
  //     }
  //   } else {
  //     const userModel = new UserModel({name, pwd})
  //     userModel.save(function (err, user) {
  //       // 向浏览器端返回cookie(key=value)
  //       // res.cookie('userid', user._id, {maxAge: 1000*60*60*24*7})
  //       req.session.userid = user._id
  //       const data = {_id: user._id, name: user.name}
  //       // 3.2. 返回数据(新的user)
  //       res.send({code: 0, data})
  //     })
  //   }
  // })
})

/*
一次性图形验证码
 */
router.get('/captcha', function (req, res) {
  var captcha = svgCaptcha.create({
    ignoreChars: '0o1l',
    noise: 2,
    color: true
  });
  req.session.captcha = captcha.text.toLowerCase();
  console.log(req.session.captcha)
  /*res.type('svg');
  res.status(200).send(captcha.data);*/
  res.type('svg');
  res.send(captcha.data)
});

/*
发送验证码短信
*/
router.get('/sendcode', function (req, res, next) {
  //1. 获取请求参数数据
  var phone = req.query.phone;
  //2. 处理数据
  //生成验证码(6位随机数)
  var code = sms_util.randomCode(6);
  //发送给指定的手机号
  console.log(`向${phone}发送验证码短信: ${code}`);
  sms_util.sendCode(phone, code, function (success) {//success表示是否成功
    if (success) {
      users[phone] = code
      console.log('保存验证码: ', phone, code)
      res.send({"code": 0})
    } else {
      //3. 返回响应数据
      res.send({"code": 1, msg: '短信验证码发送失败'})
    }
  })
})

/*
短信登陆
*/
router.post('/login_sms', function (req, res, next) {
  var phone = req.body.phone;
  var code = req.body.code;
  console.log('/login_sms', phone, code);
  if (users[phone] != code) {
    res.send({code: 1, msg: '手机号或验证码不正确'});
    return;
  }
  //删除保存的code
  delete users[phone];


  UserModel.findOne({phone}, function (err, user) {
    if (user) {
      req.session.userid = user._id
      res.send({code: 0, data: user})
    } else {
      //存储数据
      const userModel = new UserModel({phone})
      userModel.save(function (err, user) {
        req.session.userid = user._id
        res.send({code: 0, data: user})
      })
    }
  })

})

/*
根据sesion中的userid, 查询对应的user
 */
router.get('/userinfo', function (req, res) {
  // 取出userid
  const userid = req.session.userid
  // 查询
  UserModel.findOne({_id: userid}, _filter, function (err, user) {
    // 如果没有, 返回错误提示
    if (!user) {
      // 清除浏览器保存的userid的cookie
      delete req.session.userid

      res.send({code: 1, msg: '请先登陆'})
    } else {
      // 如果有, 返回user
      res.send({code: 0, data: user})
    }
  })
})


router.get('/logout', function (req, res) {
  // 清除浏览器保存的userid的cookie
  delete req.session.userid
  // 返回数据
  res.send({code: 0})
})

/*
根据经纬度获取位置详情
 */
router.get('/position/:geohash', function (req, res) {
  const {geohash} = req.params
  ajax(`http://cangdu.org:8001/v2/pois/${geohash}`)
    .then(data => {
      res.send({code: 0, data})
    })
})

/*
获取首页分类列表
 */

//checkToken代码中next()执行后才会执行 router.get 后面的函数体
// router.get('/index_category', checkToken, function(req, res){
router.get('/index_category', function (req, res) {
  setTimeout(function () {
    const data = require('../data/index_category.json')
    res.send({code: 0, data})
  }, 300)
})

/*
根据经纬度获取商铺列表
?latitude=40.10038&longitude=116.36867
 */
// router.get('/shops', checkToken, function(req, res){
router.get('/shops', function (req, res) {
  const latitude = req.query.latitude
  const longitude = req.query.longitude

  setTimeout(function () {
    const data = require('../data/shops.json')
    res.send({code: 0, data})
  }, 300)
})

router.get('/search_shops', function (req, res) {
  const {geohash, keyword} = req.query
  ajax('http://cangdu.org:8001/v4/restaurants', {
    'extras[]': 'restaurant_activity',
    geohash,
    keyword,
    type: 'search'
  }).then(data => {
    res.send({code: 0, data})
  })
})

module.exports = router;