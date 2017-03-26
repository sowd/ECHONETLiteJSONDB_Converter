var fs = require('fs');

//var log = function(){} ;
var log = console.log ;

/*
// Create SuperClass.json from SuperClass-SJIS.tab.txt
var reobj = {name:'SuperClass',methods:[]} ;
var eljcsv = fs.readFileSync('eljson/SuperClass-SJIS.tab.txt').toString() ;
eljcsv = eljcsv.split("\n") ;
eljcsv.forEach(l => {
	var ls = l.split("\t") ;
	if(ls.length < 3 ) return ;
	var m = {
		epc:ls[0]
		,doc:ls[2].split("\n").join('<br />')+'<br />'+ls[3].split("\n").join('<br />')
	} ;
	reobj.methods.push(m) ;
}) ;

fs.writeFileSync('eljson/SuperClass.json',JSON.stringify(reobj,null,"\t")) ;
return ;
*/

// Translators
// translate & checklang are functions to be set in setupgcp().
// Result is provided as the promise object
// translate(fromword , fromlocale , tolocale )
// checklang( fromstr )
var translate , checklang ;
function setupgcp(){
	try {
		var gcpSettings = JSON.parse(fs.readFileSync('googleCloudPlatfromSettings.json').toString()) ;

		var RestClient = require('node-rest-client').Client ;
		var rc = new RestClient() ;

		translate = function(fromword , fromlocale , tolocale ){
			return new Promise( (ac,rj)=>{
				rc.get('https://translation.googleapis.com/language/translate/v2'
					,{
						headers: {
							'Content-type': 'application/json'
						},
						parameters: {
							key: gcpSettings.apikey
							,source: fromlocale
							,target: tolocale
							,q: fromword
						}
					}
					,function (data, response) {
						/*for( var key in response ){
							if( typeof response[key] != 'object' && typeof response[key] != 'function' )
								log('response.'+key+':'+response[key]) ;
						}*/
						if( response.statusCode != 200 ){
							rj(response.statusMessage);
							return;
						}
						ac(data.data.translations[0].translatedText) ;
					}
				) ;
			}) ;
		} ;

		checklang = function( fromstr ){
			return new Promise( (ac,rj)=>{
				rc.get('https://translation.googleapis.com/language/translate/v2/detect'
					,{
						headers: {
							'Content-type': 'application/json'
						},
						parameters: {
							key: gcpSettings.apikey
							,q: fromstr
						}
					}
					,function (data, response) {
						if( response.statusCode != 200 ){
							rj(response.statusMessage);
							return;
						}
						ac(data.data.detections[0][0].language) ;
					}
				) ;
			}) ;
		} ;
		
	} catch(e){console.error(e);}
}
setupgcp() ;

var jp2en_cache = {} , en2jp_cache = {} ;
try {
	jp2en_cache = JSON.parse(fs.readFileSync('jp2en_cache.json').toString()) ;
} catch(e){} ;
try {
	en2jp_cache = JSON.parse(fs.readFileSync('en2jp_cache.json').toString()) ;
} catch(e){} ;

function jp2en(jpword , post_fn /*executed after result is obtained*/){
	return new Promise((ac,rj)=>{
		if( jp2en_cache[jpword] != undefined ){
			var enword = jp2en_cache[jpword] ;
			post_fn(enword) ;
			ac(enword) ;
			return ;
		}

		log('API call') ;
		translate(jpword , 'ja' , 'en' ).then(enword=>{
			jp2en_cache[jpword] = enword ;
			// Save partial cache preparing for future error
			fs.writeFileSync('jp2en_cache.json',JSON.stringify(jp2en_cache, null , "\t")) ;
			post_fn(enword) ;
			ac(enword);
		}).catch(rj) ;
	});
}
function en2jp(enword , post_fn /*executed after result is obtained*/){
	return new Promise((ac,rj)=>{
		if( en2jp_cache[enword] != undefined ){
			var jpword = en2jp_cache[enword] ;
			post_fn(jpword) ;
			ac(jpword) ;
			return ;
		}

		log('API call') ;
		translate(enword , 'en' , 'ja' ).then(jpword=>{
			en2jp_cache[enword] = jpword ;
			// Save partial cache preparing for future error
			fs.writeFileSync('en2jp_cache.json',JSON.stringify(en2jp_cache, null , "\t")) ;

			post_fn(jpword) ;
			ac(jpword);
		}).catch(rj) ;
	});
}

var eljsonidx = {} ;

var eljcsv = fs.readFileSync('eljsonindex.csv').toString() ;
eljcsv = eljcsv.split("\n") ;

eljcsv.forEach(l => {
	var ls = l.split(',') ;
	if( ls[4] !== 'True' ) return ;
	var objn_arr = ls[0].split(' ') ;
	var objname = '' ;
	objn_arr.forEach(t => {
		objname += t.charAt(0).toUpperCase() + t.substring(1) ;
	})

	var objid = ls[2] + ls[3].substring(2) ;

	// Load document file
	try {
		var fcontent = fs.readFileSync('eljson/'+objname+'.json','utf8') ;
		fcontent = JSON.parse(fcontent) ;
		fcontent.epcs = {} ;
		fcontent.methods.forEach(m=>{
			fcontent.epcs[m.epc] = m ;
		}) ;
		eljsonidx[objid] = fcontent ;
	} catch(e){ /*console.error(e);*/ }
}) ;

//fs.writeFileSync('out/eljsonidx.json',JSON.stringify(eljsonidx, null , "\t")) ;
//console.dir(eljsonidx) ;

function convPhraseToID(phrase){
	var re = phrase.replace(/ \(.+\)/g,'').replace(/[ \/\-]/g,'_').toUpperCase() ;
	while( re.indexOf('--') >= 0 )
		re = re.split('--').join('-') ;
	return re ;
}
function convToWikiName(src){
	return src.replace(/ \(.+\)/g,'').replace(/[ \/\-]/g,' ').split(' ').map(
		t=>{return t.charAt(0).toUpperCase() + t.substring(1).toLowerCase();} ).join('') ;
}


var all_body = {elObjects:{}} ;
var all_jp = {names:{}} ;
var all_en = {names:{}} ;

const loadfiles = ['superClass' ,'deviceObject_G' ,'nodeProfile'] ;
var loadfile_len = loadfiles.length ;
loadfiles.forEach( fnprefix => {

	log(fnprefix) ;

	var src = JSON.parse( fs.readFileSync(fnprefix+'.json').toString() ) ;

	var body = {date:src.date,version:src.version,elObjects:{}} ;
	var jp   = {date:src.date,version:src.version,names:{}} ;
	var en   = {date:src.date,version:src.version,names:{}} ;

	var promises = [] ;

	for( var objid in src.elObjects ){
		const OBJ_NAME_KEY = '$OBJNAME_'+objid.substring(2) ;
		const objname_jp = src.elObjects[objid].objectName ;
		jp.names[OBJ_NAME_KEY] = objname_jp ;
		promises.push(jp2en(objname_jp , objname_en=>{
			en.names[OBJ_NAME_KEY] = objname_en ;
		})) ;

		var epcs_b = {} ;
		for( var epc in src.elObjects[objid].epcs ){ (function(){
			const epcobj = src.elObjects[objid].epcs[epc] ;
			epcs_b[epc] = {} ;

			// Just copy
			['accessModeAnno','accessModeGet','accessModeSet','epcSize'].forEach(belem => {
				epcs_b[epc][belem] = epcobj[belem] ;
			}) ;

			const epcname_jp = epcobj.epcName ;
			promises.push( new Promise( (ac,rj)=>{
				jp2en(epcname_jp , epcname_en=>{
					const EPC_NAME_KEY = '$EPCNAME_'+convPhraseToID(epcname_en) ;
					jp.names[EPC_NAME_KEY] = epcname_jp ;
					en.names[EPC_NAME_KEY] = epcname_en ;
					epcs_b[epc].epcName = EPC_NAME_KEY ;
					try {
						const edoc = eljsonidx[objid].epcs[epc].doc ;
						const EPC_DOC_KEY = '$EPCDOC_'+objid.substring(2)+'_'+epc.substring(2) ;
						epcs_b[epc].doc = EPC_DOC_KEY ;
						en.names[EPC_DOC_KEY] = edoc.split('<br>').join("\n").split('<br />').join("\n") ;
						en2jp(edoc , jdoc=>{
							jp.names[EPC_DOC_KEY] = jdoc.split('<br>').join("\n").split('<br />').join("\n") ;
						}).then(ac).catch(ac) ;
					} catch(e){ ac(e); /* console.error(e);*/}
				} )
			})) ;

			epcs_b[epc].edt = [] ;
			epcobj.edt.forEach(edt=>{
				const elemname_jp = edt.elementName ;

				var edtobj = {
					content : edt.content
					, elementSize : edt.elementSize
					, repeatCount : edt.repeatCount
				} ;
				epcs_b[epc].edt.push(edtobj) ;

				promises.push( jp2en(elemname_jp , elemname_en=>{
					const ELEM_NAME_KEY = '$ELEMNAME_'+convPhraseToID(elemname_en) ;
					jp.names[ELEM_NAME_KEY] = elemname_jp ;
					en.names[ELEM_NAME_KEY] = elemname_en ;
					edtobj.elementName = ELEM_NAME_KEY ;
					/*
					// currently, 'content' property is skipped
					if( edt.content.numericValue != undefined ){
						edtobj.type = 'numericValue' ;
						edtobj.parameters = edtobj.content.numericValue ;
						edtobj.parameters.range = {
							'0x'+edtobj.parameters.min.toString(16).toUpperCase() : 'min'
							,'0x'+edtobj.parameters.max.toString(16).toUpperCase() : 'max'
						} ;
						delete edtobj.parameters.min ;
						delete edtobj.parameters.max ;
						if( edt.content.keyValues != undefined ){
							edtobj.parameters.range = {} ;
							for( var kv in edt.content.keyValues ){
								edtobj.parameters.range[kv] = edt.content.keyValues[kv].toLowerCase() ;
							}
						}
					} else if( edt.content.level != undefined ){
						edtobj.type = 'level' ;
						edtobj.parameters = edtobj.content.level ;
					}
					*/
				} )) ;
			}) ;
		})();}

		body.elObjects[objid]	= {objectName:OBJ_NAME_KEY , epcs:epcs_b} ;
	}


	Promise.all(promises).then(()=>{
		// Post processing
		// add objectid 
		for( var objid in body.elObjects ){
			var targ_o = body.elObjects[objid] ;

			// Add epcType
			var newepcs = {} ;
			for( var epc in targ_o.epcs ){
				var epcobj = targ_o.epcs[epc] ;
				newepcs[epc] = { epcType : convToWikiName( en.names[epcobj.epcName] ) } ;

				// Reorder
				['epcName','epcSize','accessModeAnno','accessModeGet','accessModeSet','doc']
					.forEach(kn=>{newepcs[epc][kn]=epcobj[kn];}) ;
				var newedt = [] ;
				epcobj.edt.forEach( edto=>{
					// add elementType
					var newedto = {elementType : convToWikiName( en.names[edto.elementName] )} ;
					['elementName','elementSize','repeatCount','content']
						.forEach(kn=>{newedto[kn]=edto[kn];}) ;
					newedt.push(newedto) ;
				} ) ;
				newepcs[epc].edt = newedt ;
			}
			targ_o.epcs = newepcs ;


			// Add objectType
			const OBJ_NAME_KEY = '$OBJNAME_'+objid.substring(2) ;
			var objname_en = en.names[OBJ_NAME_KEY] ;
			var objtype = convToWikiName(objname_en) ;
			if( objtype.indexOf('The')===0 )	objtype = objtype.substring(3) ;
			if( objtype.indexOf('An')===0 )		objtype = objtype.substring(2) ;
			body.elObjects[objid] = {	// Ordering
				objectType:objtype , objectName:targ_o.objectName , epcs:targ_o.epcs
			} ;

		}

		fs.writeFileSync('out/'+fnprefix+'_Body.json',JSON.stringify(body, null , "\t")) ;
		fs.writeFileSync('out/'+fnprefix+'_JP.json',JSON.stringify(jp, null , "\t")) ;
		fs.writeFileSync('out/'+fnprefix+'_EN.json',JSON.stringify(en, null , "\t")) ;

		if( fnprefix == 'nodeProfile'){
			['date','version'].forEach(elm=>{
				all_body['nodeprofile_'+elm] = body[elm] ;
				all_jp['nodeprofile_'+elm] = jp[elm] ;
				all_en['nodeprofile_'+elm] = en[elm] ;
			}) ;
		} else {
			['date','version'].forEach(elm=>{
				all_body[elm] = body[elm] ;
				all_jp[elm] = jp[elm] ;
				all_en[elm] = en[elm] ;
			}) ;
		}
		Object.assign(all_body.elObjects,body.elObjects) ;
		Object.assign(all_jp.names, jp.names) ;
		Object.assign(all_en.names, en.names) ;

		if( --loadfile_len == 0 ){
			fs.writeFileSync('out/all_Body.json',JSON.stringify(all_body, null , "\t")) ;
			fs.writeFileSync('out/all_JP.json',JSON.stringify(all_jp, null , "\t")) ;
			fs.writeFileSync('out/all_EN.json',JSON.stringify(all_en, null , "\t")) ;
			//fs.writeFileSync('jp2en_cache.json',JSON.stringify(jp2en_cache, null , "\t")) ;
			//fs.writeFileSync('en2jp_cache.json',JSON.stringify(en2jp_cache, null , "\t")) ;
		}
		log(fnprefix+' data written.') ;
	}).catch(e=>{
		console.error(e) ;
	})
}) ;
