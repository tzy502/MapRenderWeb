import * as WZ from './wz_loader'
import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { MovedEvent, ZoomedEvent } from 'pixi-viewport/dist/types'

//------------------------------
// custom PIXI containers

interface MaplestoryMapBackRenderResource {
    get rect(): PIXI.Rectangle
    update(deltaTime: number): void
    clone(): PIXI.DisplayObject
}

class MaplestoryAnimatedSprite extends PIXI.AnimatedSprite implements MaplestoryMapBackRenderResource {
    constructor(textures: PIXI.Texture[] | PIXI.FrameObject[], autoUpdate?: boolean) {
        super(textures, autoUpdate);
        this._rawTextures = textures;
        this._rect = new PIXI.Rectangle();
    }

    private _rawFrames?: Array<WZ.Frame>
    private readonly _rawTextures: PIXI.Texture[] | PIXI.FrameObject[]
    private _rect: PIXI.Rectangle

    update(deltaTime: number): void {
        super.update(deltaTime);

        if (this.rawFrames && this.currentFrame < this.rawFrames.length) {
            const rawFrame = this.rawFrames[this.currentFrame];
            this.pivot.set(rawFrame.originX, rawFrame.originY);

            const currentTime = <number>this["_currentTime"] % 1;
            this.alpha = (rawFrame.a0 * (1 - currentTime) + rawFrame.a1 * currentTime) / 255.0;
        }
    }

    get rect(): PIXI.Rectangle {
        return this._rect;
    }

    get rawFrames(): Array<WZ.Frame> | undefined {
        return this._rawFrames;
    }

    set rawFrames(value: Array<WZ.Frame> | undefined) {
        this._rawFrames = value;
        this._rect = this.calculateRect();
    }

    clone(): MaplestoryAnimatedSprite {
        const clonedObj = new MaplestoryAnimatedSprite(this._rawTextures, this.autoUpdate);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        clonedObj.loop = this.loop;
        clonedObj.rawFrames = this.rawFrames;
        clonedObj.currentFrame = this.currentFrame;
        clonedObj["_currentTime"] = this["_currentTime"];

        this.playing ? clonedObj.play() : clonedObj.stop();
        // force updating once to sync all properties.
        clonedObj.update(0);
        return clonedObj;
    }

    private calculateRect(): PIXI.Rectangle {
        if (!this.rawFrames) {
            return new PIXI.Rectangle();
        }

        let left = Number.MAX_SAFE_INTEGER,
            top = Number.MAX_SAFE_INTEGER,
            right = Number.MIN_SAFE_INTEGER,
            bottom = Number.MIN_SAFE_INTEGER;

        this.rawFrames.forEach(frame => {
            left = Math.min(left, -frame.originX);
            top = Math.min(top, -frame.originY);
            right = Math.max(right, -frame.originX + frame.width);
            bottom = Math.max(bottom, -frame.originY + frame.height);
        });

        // handle flipX
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(left * this.scale.x, top, (right - left) * this.scale.x, bottom - top);
        } else {
            return new PIXI.Rectangle(right * this.scale.x, top, (left - right) * this.scale.x, bottom - top);
        }
    }
}

class MaplestorySprite extends PIXI.Sprite implements MaplestoryMapBackRenderResource {
    constructor(texture?: PIXI.Texture) {
        super(texture);
    }

    get rect(): PIXI.Rectangle {
        if (!this.texture) return new PIXI.Rectangle();
        let rect = new PIXI.Rectangle(-this.pivot.x, -this.pivot.y, this.texture.width, this.texture.height);
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(rect.x * this.scale.x, rect.y, this.texture.width * this.scale.x, this.texture.height);
        } else {
            return new PIXI.Rectangle(rect.right * this.scale.x, rect.y, this.texture.width * -this.scale.x, this.texture.height);
        }
    }

    update(deltaTime: number): void {
        // non-op function
    }

    clone(): MaplestorySprite {
        const clonedObj = new MaplestorySprite(this.texture);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        return clonedObj;
    }
}



//------------------------------

// const app = new PIXI.Application({
//     backgroundColor: 0xdddddd,
//     // resizeTo: window,
//     width: 1150,  // 设置宽度为800像素
//     height: 768,  // 设置高度为600像素
// });
// // document.body.appendChild(app.view as HTMLCanvasElement)
// const mapDiv = document.getElementById("map");
// if (mapDiv) {
//     mapDiv.appendChild(app.view as HTMLCanvasElement);
// }

// // create viewport
// const viewport = new Viewport({
//     screenWidth: window.innerWidth,
//     screenHeight: window.innerHeight,
//     worldWidth: null,
//     worldHeight: null,

//     events: app.renderer.events // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
// })

// // add the viewport to the stage
// app.stage.addChild(viewport)


// // activate plugins
// viewport
//     .drag()
//     // .pinch()
//     .wheel()
//     .decelerate();

function createBckgroundFrame(): PIXI.Container {
    const container = new PIXI.Container();


    return container;
}

function compositeZIndex(z0: number, z1?: number, z2?: number): number {
    const scale = 1 << 10; // 1024
    const normalize = (v?: number) => {
        // -512 <= v <= 511
        v = Math.round(v || 0) + scale / 2;
        // 0 <= v <= 1023
        v = Math.max(0, Math.min(v, scale - 1));
        return v;
    };
    return normalize(z0) * scale * scale
        + normalize(z1) * scale
        + normalize(z2);
}


function promiseWithIndex<T>(promiseArray: Promise<T>[]): Promise<{ texture: T, index: number }[]> {
    /**
     * 由于网络不保证顺序性
     * 根据 element 在 array 的顺序
     * 返回结果 {texture: texture, index:index}
     */

    return Promise.all(
        promiseArray.map((promiseObj, index) =>
            promiseObj.then(texture => ({ texture, index }))
        )
    )
}

function renderFrames(frameAni: WZ.FrameAnimate, callBack: (frames: Array<PIXI.FrameObject>) => void) {
    const promiseList = new Array<Promise<PIXI.Texture<PIXI.Resource>>>();
    const frameList = new Array<WZ.Frame>()
    for (let k = 0; k < frameAni.frames.length; k++) {
        const frame = frameAni.frames[k];
        const spriteImageUrl = new URL(frame.resourceUrl, baseUrl).toString();
        const texture = PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
        promiseList.push(texture)
        frameList.push(frame)
    }

    promiseWithIndex(promiseList)
        .then(results => {
            const frames = new Array<PIXI.FrameObject>();
            results.forEach(({ texture, index }) => {
                // todo: may be error
                // js feature
                // a = []
                // a[2] = 1
                // ==> [empty X 2, 1]
                frames[index] = { texture: texture, time: frameList[index].delay }
            })
            return frames;
        })
        .then((frames) => {
            callBack(frames)
        })
}


async function loadAndRenderMap(mapID: number): Promise<void> {
    const mapleLife = await WZ.loadMapInfo(mapID, baseUrl);
    if(!mapleLife.lifes){
        console.log
    }
    if (mapleLife.lifes) {
        let width = 1150;
        let height = 768;
        let change=false;
        if(width>=mapleLife.width||height>=mapleLife.height){
            width=mapleLife.width
            height=mapleLife.height
            change=true;
        }
        width =  Math.min(width,mapleLife.width);
        height =  Math.min(height,mapleLife.height);
        const app = new PIXI.Application({
            backgroundColor: 0xdddddd,
            // resizeTo: window,
            width: width, 
            height: height, 
        });
        // document.body.appendChild(app.view as HTMLCanvasElement)
        const mapDiv = document.getElementById("map");
        if (mapDiv) {
            mapDiv.appendChild(app.view as HTMLCanvasElement);
        }
        // create viewport
        const viewport = new Viewport({
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight,
            worldWidth: null,
            worldHeight: null,
            events: app.renderer.events // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
        })

        // add the viewport to the stage
        app.stage.addChild(viewport)

        if(!change){
            viewport
            .drag()
            // .pinch()
            .wheel()
            .decelerate();
        }
        // activate plugins
      
        
        const layerContainer = viewport.addChild(new PIXI.Container());
        app.renderer.on("resize", () => {
            viewport.resize(app.renderer.width, app.renderer.height);
        });
        const lifeContainer = layerContainer.addChild(new PIXI.Container());
        lifeContainer.sortableChildren = true;
        for (let j = 0; j < mapleLife.lifes.length; j++) {

            const maplife = mapleLife.lifes[j];
            const frameAni = maplife.resource;
            if (frameAni && frameAni.frames) {
                renderFrames(frameAni, (frames) => {

                    const aniObj = lifeContainer.addChild(new MaplestoryAnimatedSprite(frames));
                    aniObj.rawFrames = frameAni.frames;
                    aniObj.position.set(maplife.x, maplife.y);
                    aniObj.zIndex = compositeZIndex(maplife.z, maplife.id);
                    if (maplife.flipX) {
                        aniObj.scale.x = -1;
                    }
                    aniObj.loop = true;

                    var frontColor = '0xFFFFFF';

                    console.log(maplife.lifeName)
                    if (maplife.lifeName) {
                        const fontSize = 12;

                        const namePlateContainer = new PIXI.Container();

                        namePlateContainer.position.set(maplife.x, maplife.y + 2); // 设置姓名牌容器的位置为动画对象底部
                        lifeContainer.addChild(namePlateContainer);
                        //要先生成名字才知道宽度
                        const nameText1 = new PIXI.Text(maplife.lifeName, { fontFamily: "SimSun", fontSize: fontSize, fill: frontColor, textBaseline: 'alphabetic', lineHeight: fontSize + 1 });

                        //画背景
                        const nameText1Background = new PIXI.Graphics();
                        nameText1Background.position.set(0, 2);
                        nameText1Background.beginFill(0xff000000, 0.65);
                        nameText1Background.drawRoundedRect(-nameText1.width / 2 - 5, 0, nameText1.width + 10, nameText1.height + 5, 3); // 调整背景尺寸和位置
                        nameText1Background.endFill();
                        namePlateContainer.addChild(nameText1Background); // 将背景放在容器的底部
                        //画名字
                        // nameText1.anchor.set(5,2); // 要回调回去 
                        nameText1.position.set(-nameText1.width / 2, 2);
                        nameText1.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
                        nameText1Background.addChild(nameText1);


                        if (maplife.lifeFunc) {

                            //要先生成名字才知道宽度
                            const nameText2 = new PIXI.Text(maplife.lifeFunc, { fontFamily: "SimSun", fontSize: fontSize, fill: frontColor, textBaseline: 'alphabetic', lineHeight: fontSize + 1 });

                            //画背景
                            const nameText2Background = new PIXI.Graphics();
                            nameText2Background.position.set(0, 2 + 3 + nameText1Background.height);
                            nameText2Background.beginFill(0xff000000, 0.65);
                            nameText2Background.drawRoundedRect(-nameText2.width / 2 - 5, 0, nameText2.width + 10, nameText2.height + 5, 3); // 调整背景尺寸和位置
                            nameText2Background.endFill();
                            namePlateContainer.addChild(nameText2Background); // 将背景放在容器的底部
                            //画名字
                            // nameText1.anchor.set(5,2); // 要回调回去 
                            nameText2.position.set(-nameText2.width / 2, 2);
                            nameText2.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
                            nameText2Background.addChild(nameText2);
                        }
                    }
                    aniObj.play();
                })
            }
        }

        viewport.addChild(createBckgroundFrame());
        viewport.sortableChildren = true;
    }

}


const queryString = new URLSearchParams(window.location.search);
const mapID = Number.parseInt(queryString.get("mapID") || "100000000");  // <- change to your own
const clientVer = queryString.get("ver") || "CMST-193";                  // <- change to your own
const baseUrl = new URL(`/maplestory`, "https://wiki.biligame.com");

PIXI.Ticker.shared.autoStart = false;
loadAndRenderMap(mapID).then(mapInfo => {
    console.log("success");
    PIXI.Ticker.shared.start();
    console.log("success11");
}).catch(e => {
    console.error(e);
    console.log("地图加载出错")
    const mapElement = document.getElementById("map");
    if (mapElement) {
        mapElement.remove();
    }
    // 修改 <div> 元素的内容
    const noticeElement = document.getElementById("notice");
    if (noticeElement) {
        noticeElement.innerHTML = "此地图无法模拟或者模拟错误<br/>如非莫奈德系列地图请联系 龙胶水";
        noticeElement.style.display = "block";
    }
}); 