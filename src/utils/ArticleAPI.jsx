import axios from "axios";
import UserAPI from "./UserAPI";
import UI from "./UI";

var sortBy = {
    "date-sb": "date-sb", // old to new
    "date-bs": "date-bs", // new to old
    "bp": "bp", // downvotes
    "gb": "gb", // upvotes
    "replies": "replies" 
}

var articleApiPath = "http://localhost:3000/api/articles"
var commentApiPath = (id) => `${articleApiPath}/${id}/comments`
var replyApiPath = (articleId, commentId) => `${commentApiPath(articleId)}/${commentId}/replies`

/**
 * comment class
 */
class Comment{
    /**@type {Array<Comment>} */
    replies = [];
    /**@type {Number} */
    repliesCount;
    /**@type {Number} */
    bpCount;
    /**@type {Number} */
    gpCount;
    /**@type {string} */
    userId;
    /**@type {string} */
    id;
    /**@type {Comment | ArticleAPI} */
    target;
    /**@type {ArticleAPI} */
    article;
    /**@type {string} */
    content;
    /**@type {boolean} */
    error;
    /**@type {Number} */
    selfVote; //1 : gp, 0 : none, -1 : bp

    /**
     * construct the comment object
     * @param {ArticleAPI} article
     * @param {string} content 
     * @param {string} userId 
     * @param {Comment | ArticleAPI} target
     * @param {Number} bp 
     * @param {Number} gp 
     * @param {Number} replies 
     */
    static async init(article, content, userId, bp, gp, replies, id, target){
        var result = new Comment();
        result.id = id;
        result.article = article
        result.content = content
        result.userId = userId
        result.bpCount = bp
        result.gpCount = gp
        result.repliesCount = replies
        result.target = target
        
        try{ await result.syncSelfVote() }
        catch(e){ result.error = true };
        
        return result
    }

    /**
     * fetch 50 replies per call, load more by calling this function again
     */
    async fetchReplies(){
        if (this.target instanceof Comment) return false;

        try{
            var lastId;
            if (this.replies.length > 0){
                lastId = this.replies[this.replies.length - 1].id;
            }

            var res = await axios.get(
                `${commentApiPath(this.article.id)}/${this.id}/replies?sortBy=${this.article.sortBy}&lastId=${lastId}`
            );

            res = res.data;
            for (var i in res.comments){
                var that = res.comments[i];
                var comment = Comment.init(
                    this.article, that.content, that.userId, that.bpCount, that.gpCount, that.repliesCount, 
                    that.id, this
                );
                this.replies.push(comment)
            }
            return true
        }
        catch(e){
            this.error = true
            return false
        }
    }

    /**
     * dislike the comment
     */
    async bp(){
        var bp_api = (this.target instanceof Comment) ?
        `${replyApiPath(this.article.id, this.id)}/${this.id}/bp` : `${commentApiPath(this.article.id)}/${this.id}/bp`;
        try{
            await axios.put(`${bp_api}?user=${UserAPI.currentUserId}`);
            if (this.selfVote === -1){
                this.selfVote = 0;
                this.bpCount -= 1;
            }
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: bp on article ${this.id}\n${e}`)
            return false
        }
        
    }

    /**
     * like the comment
     */
    async gp(){
        var gp_api = (this.target instanceof Comment) ?
        `${replyApiPath(this.article.id, this.id)}/${this.id}/gp` : `${commentApiPath(this.article.id)}/${this.id}/gp`;
        try{
            await axios.put(`${gp_api}?user=${UserAPI.currentUserId}`);
            if (this.selfVote === 1){
                this.selfVote = 0;
                this.gpCount -= 1;
            }
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: gp on article ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * reply to the comment
     * @param {string} content
     */
    async postReply(content){
        try{
            var id = this.id

            if (this.target instanceof Comment){
                id = this.target.id;
            }

            await axios.post(`${replyApiPath(this.article.id, id)}?user=${UserAPI.currentUserId}`, {
                content: content
            });

            if (this.target instanceof Comment){
                this.target.repliesCount += 1;
            }

            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: post_reply on article ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * return true if the comment is post by the current user
     */
    deletable(){
        return this.userId === UserAPI.currentUserId;
    }

    /**
     * delete the comment
     */
    async delete(){
        try{
            if (this.target instanceof Comment){
                await axios.delete(`${commentApiPath(this.article.id)}/${this.id}?user=${UserAPI.currentUserId}`);
                this.target.repliesCount -= 1;
            }
            else{
                await axios.delete(`${replyApiPath(this.article.id, this.target.id)}/${this.id}?user=${UserAPI.currentUserId}`);
                this.article.commentsCount -= 1;
            }
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: delete_comment on article ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * sync self's like or dislike status
     */
    async syncSelfVote(){
        var res = await axios.get(`${articleApiPath}/bpgp/${this.id}?user=${UserAPI.currentUserId}`)
        res = res.state
        this.selfVote = res.vote
    }

}



/**
 * article class
 */
class ArticleAPI{
    /**@type {ArticleAPI} */
    static articles = [];
    
    /**
     * @param {string} id 
     * @returns {ArticleAPI | false}
     */
    static async getArticleById(id){
        var article = this.articles.find((article) => article.id === id)
        var avaliable = true
        if (article === undefined){
            article = new ArticleAPI(id)
            await article.init()
            avaliable = !article.article_error
        }
        if (!avaliable){
            return false
        }
        return article;
    }


    /**@type {string}*/
    id;
    /**@type {string} */
    sortBy = sortBy["date-bs"];
    /**@type {string} */
    title;
    /**@type {string} */
    content;
    /**@type {string} */
    thumbnail;
    /**@type {string} */
    postBy;
    /**@type {Array{Comment}}*/
    comments = [];
    /**@type {lastId} */
    lastId;
    /**@type {boolean} */
    articleError;
    /**@type {boolean} */
    comments_error;
    /**@type {Number} */
    bpCount;
    /**@type {Number} */
    gpCount;
    /**@type {Number} */
    commentsCount;
    /**@type {Number} */
    selfVote; //1 : gp, 0 : none, -1 : bp
    
    /**
     * construct an article object by id
     * @param {string} id
     */
    constructor(id){
        this.id = id;
    }

    /**
     * init the article object
     */
    async init(){
        try{
            var res = await axios.get(`${articleApiPath}/${this.id}`)
            res = res.data

            this.title = res.title
            this.content = res.content
            this.thumbnail = res.thumbnail
            this.bpCount = res.bp
            this.gpCount = res.gp
            this.commentsCount = res.comments
            this.postBy = res.userId
            await this.syncSelfVote()
            ArticleAPI.articles.push(this)
            return true
        }
        catch(e){
            this.articleError = true
            return false
        }
    }

    /**
     * sync self's like or dislike status
     */
    async syncSelfVote(){
        var res = await axios.get(`${articleApiPath}/bpgp/${this.id}?user=${UserAPI.currentUserId}`)
        res = res.state
        this.selfVote = res.vote
    }

    /**
     * fetch 50 comments per call, load more by calling this function again
     */
    async fetchComments(){
        try{
            var res = await axios.get(`${commentApiPath(this.id)}?sortBy=${this.sortBy}&lastId=${lastId}`)
            res = res.data
            var result = []

            for (var i in res.comments){
                var that = res.comments[i];
                var comment = Comment.init(
                    this, that.content, that.userId, that.bp, that.gp, that.replies, that.id, this
                );
                this.comments.push(comment)
                result.push(comment)
            }

            lastId = this.comments[this.comments.length - 1].id;
            return result
        }
        catch(e){
            this.comments_error = true
            return false
        }
    }

    /**
     * dislike the article
     */
    async bp(){
        try{
            await axios.put(`${articleApiPath}/${this.id}/bp?user=${UserAPI.currentUserId}`)
            if (this.selfVote === -1){
                this.selfVote = 0;
                this.bpCount -= 1;
            }
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: bp_article on ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * like the article
     */
    async gp(){
        try{
            await axios.put(`${articleApiPath}/${this.id}/gp?user=${UserAPI.currentUserId}`)
            if (this.selfVote === 1){
                this.selfVote = 0;
                this.gpCount -= 1;
            }
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: gp_article on ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * post a comment
     * @param {string} content
     */
    async postComment(content){
        try{
            await axios.post(`${commentApiPath(this.id)}?user=${UserAPI.currentUserId}`, {
                content: content
            });
            this.commentsCount += 1
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: post_comment on ${this.id}\n${e}`)
            return false
        }
    }

    /**
     * return true if the article is post by the current user
     */
    deleteable(){
        return UserAPI.currentUserId === this.postBy;
    }

    /**
     * delete the article
     */
    async delete(){
        try{
            await axios.delete(`${articleApiPath}/${this.id}?user=${UserAPI.currentUserId}`);
            return true
        }
        catch(e){
            UI.raiseError("Error", `此事件交互失敗: delete_article on ${this.id}\n${e}`)
            return false
        }
    }
}


export default ArticleAPI;