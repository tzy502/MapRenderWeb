export interface MapInfo
{
	id: number
    layers: Array<MapLayer>
	backs: Array<MapBack>
	mapPortals: Array<MapPortal>
	mapReactors: Array<MapReactor>
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export interface MapLayer
{
	tiles?: Array<MapTile>
	objs?: Array<MapObj>
	lifes?: Array<MapLife>
}

export interface MapTile
{
    id: number
	x: number
	y: number
	resource: Sprite
}

export interface MapObj
{
    id: number
	x: number
	y: number
	z: number
	flipX: boolean
	resource: FrameAnimate
}
export interface MapLife
{
    id: number
	x: number
	y: number
	z: number
	flipX: boolean
	resource: FrameAnimate
	lifeName: string
	lifeFunc: string
	type: string
}

export interface MapReactor
{
    id: number
	x: number
	y: number
	flipX: boolean
	resource: FrameAnimate
}

export interface MapPortal
{
    id: number
	x: number
	y: number
	toMap: string
	resource: FrameAnimate
}
export interface MapBack
{
	id : number
	x : number
	y : number
	cx : number
	cy : number
	rx : number
	ry : number
	alpha : number
	flipX : boolean
	front : boolean
	ani : number
	type : number
	resource : Sprite | FrameAnimate | undefined
}

export interface Sprite
{
	width: number
	height: number
	originX: number
	originY: number
	z: number
	resourceUrl: string
}

export interface Frame extends Sprite
{
	delay: number
	a0: number
	a1: number
}

export interface FrameAnimate
{
	frames: Array<Frame>
}

export async function loadMapInfo(mapID: number, publicResourceBaseUrl?: string | URL | undefined) : Promise<MapInfo> {
	console.log("loadMapInfo")
	const divElement = document.getElementById("code");
	let content="";
	if (divElement) {
	  // 获取文本内容
	  if(divElement.textContent){
		content = divElement.textContent;
	  }
	  
	  console.log(content); 
	} else {
	  console.log("未找到指定的元素");
	}
	console.log("5.0");
    const resp = await fetch("https://wiki.biligame.com/maplestory/data:mapinfo/"+content+"?action=raw");
	// const resp = await fetch("http://localhost:9334/map");
    const respBody = await resp.json();
    return respBody as MapInfo;
}
