import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import ArticleAPI from '@/utils/ArticleAPI';

const initialState = {};

export const fetchArticle = createAsyncThunk('article/fetchArticle', async (articleId) => {
    const article = await ArticleAPI.getArticleById(articleId);

    if (article.articleError) {
        console.error("article fetch error");
        return;
    }

    return article;
});


const articleSlice = createSlice({
    name: 'article',
    initialState,
    reducers:{},
    extraReducers: (builder) => {
        builder.addCase(fetchArticle.fulfilled, (state, action) => action.payload);
    }
});

export default articleSlice.reducer;
